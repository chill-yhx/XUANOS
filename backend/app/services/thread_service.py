import logging

from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.idempotency import IdempotencyManager
from app.db.seed import ensure_user_snapshot
from app.models.action_result import ActionResult
from app.models.plan import Plan
from app.models.snapshot import UserSnapshot
from app.models.thread import Thread
from app.repositories.snapshots import SnapshotRepository
from app.repositories.threads import ThreadRepository
from app.repositories.workflow import WorkflowRepository
from app.rules.workflow_steps import later_workflow_step
from app.schemas.action_result import ActionResultRead
from app.schemas.plan import PlanItemRead, PlanRead
from app.schemas.thread import ThreadAggregate, ThreadCreate, ThreadRead
from app.schemas.understanding import (
    AnswerRead,
    CorrectionRead,
    UnderstandingSessionRead,
    UnderstandingSummaryRead,
)

logger = logging.getLogger(__name__)


class ThreadService:
    def __init__(self, session: Session, user_id: str) -> None:
        self.session = session
        self.user_id = user_id
        self.threads = ThreadRepository(session)
        self.snapshots = SnapshotRepository(session)
        self.workflow = WorkflowRepository(session)

    def create(self, payload: ThreadCreate, idempotency_key: str) -> dict:
        ensure_user_snapshot(self.session, self.user_id)
        manager = IdempotencyManager(
            self.session,
            self.user_id,
            "POST /api/threads",
            idempotency_key,
            payload.model_dump(mode="json"),
        )
        if replay := manager.replay():
            return replay

        thread = self.threads.add(Thread(user_id=self.user_id, title=payload.title.strip()))
        self.session.flush()
        data = ThreadRead.model_validate(thread).model_dump(mode="json")
        manager.store("thread", thread.id, data)
        self.session.commit()
        return data

    def list(self, limit: int, thread_status: str | None = None) -> list[Thread]:
        ensure_user_snapshot(self.session, self.user_id)
        self.session.commit()
        return self.threads.list_for_user(self.user_id, limit, thread_status)

    def get_aggregate(self, thread_id: str) -> ThreadAggregate:
        thread = self.threads.get_for_user(thread_id, self.user_id)
        if thread is None:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                "RESOURCE_NOT_FOUND",
                "任务线程不存在。",
                {"thread_id": thread_id},
            )
        snapshot = self.snapshots.get_current(self.user_id)
        if snapshot is None:
            _, snapshot = ensure_user_snapshot(self.session, self.user_id)
            self.session.commit()
        understanding = (
            self.workflow.get_understanding(thread.active_understanding_session_id, self.user_id)
            if thread.active_understanding_session_id
            else None
        )
        plan_versions = self.workflow.plan_versions(thread.id)
        current_plan = self.workflow.get_plan(thread.active_plan_id, self.user_id) if thread.active_plan_id else None
        latest_action = self.workflow.latest_action_result(thread.id)
        current_plan = self._safe_active_plan(thread, current_plan, plan_versions, latest_action)
        thread_read = self._safe_thread_read(thread, current_plan, latest_action, snapshot)
        return ThreadAggregate(
            thread=thread_read,
            active_understanding_session=(
                UnderstandingSessionRead.model_validate(understanding) if understanding else None
            ),
            current_answers=(
                [AnswerRead.model_validate(answer) for answer in self.workflow.current_answers(understanding.id)]
                if understanding
                else []
            ),
            understanding_summary=self._understanding_summary(understanding),
            recent_corrections=[
                CorrectionRead.model_validate(correction) for correction in self.workflow.corrections(thread.id)
            ],
            current_plan=self._plan_read(current_plan) if current_plan else None,
            plan_versions=[self._plan_read(plan) for plan in plan_versions],
            latest_action_result=ActionResultRead.model_validate(latest_action) if latest_action else None,
            current_snapshot=snapshot,
        )

    @staticmethod
    def _safe_active_plan(
        thread: Thread,
        current_plan: Plan | None,
        plan_versions: list[Plan],
        latest_action: ActionResult | None,
    ) -> Plan | None:
        if latest_action is not None:
            action_plan = next((plan for plan in plan_versions if plan.id == latest_action.plan_id), None)
            if (
                action_plan is not None
                and action_plan.status == "accepted"
                and (current_plan is None or current_plan.status == "superseded")
            ):
                logger.warning(
                    "Derived active plan %s for thread %s from latest action result %s",
                    action_plan.id,
                    thread.id,
                    latest_action.id,
                )
                return action_plan

        if current_plan is not None and current_plan.status == "superseded":
            successors = [
                plan
                for plan in plan_versions
                if plan.root_plan_id == current_plan.root_plan_id and plan.status in {"generated", "accepted"}
            ]
            if successors:
                derived = max(successors, key=lambda plan: plan.version)
                logger.warning(
                    "Derived active plan %s for thread %s because persisted plan %s is superseded",
                    derived.id,
                    thread.id,
                    current_plan.id,
                )
                return derived
        return current_plan

    @staticmethod
    def _safe_thread_read(
        thread: Thread,
        current_plan: Plan | None,
        latest_action: ActionResult | None,
        snapshot: UserSnapshot,
    ) -> ThreadRead:
        minimum_step: str | None = None
        if current_plan is not None and current_plan.status == "accepted":
            if current_plan.accepted_at is None:
                logger.error("Accepted plan %s has no accepted_at timestamp", current_plan.id)
            else:
                minimum_step = "action_pending"
        if latest_action is not None:
            minimum_step = later_workflow_step(minimum_step or "idle", "action_pending")
        if latest_action is not None and snapshot.source_action_result_id == latest_action.id:
            minimum_step = "system_revised"

        current_step = thread.current_step
        if minimum_step is not None:
            derived_step = later_workflow_step(current_step, minimum_step)
            if derived_step != current_step:
                logger.warning(
                    "Derived workflow step %s for thread %s; persisted step is %s",
                    derived_step,
                    thread.id,
                    current_step,
                )
            current_step = derived_step

        active_plan_id = current_plan.id if current_plan is not None else thread.active_plan_id
        return ThreadRead.model_validate(thread).model_copy(
            update={"current_step": current_step, "active_plan_id": active_plan_id}
        )

    def _plan_read(self, plan) -> PlanRead:
        result = PlanRead.model_validate(plan)
        result.items = [PlanItemRead.model_validate(item) for item in self.workflow.plan_items(plan.id)]
        return result

    @staticmethod
    def _understanding_summary(understanding) -> UnderstandingSummaryRead | None:
        if understanding is None or understanding.real_goal is None:
            return None
        return UnderstandingSummaryRead(
            real_goal=understanding.real_goal,
            foundation=understanding.foundation or "",
            constraints=understanding.constraints_summary or "",
            tension=understanding.tension or "",
            uncertain=understanding.uncertain or "",
        )
