from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.idempotency import IdempotencyManager
from app.db.seed import ensure_user_snapshot
from app.models.thread import Thread
from app.repositories.snapshots import SnapshotRepository
from app.repositories.threads import ThreadRepository
from app.repositories.workflow import WorkflowRepository
from app.schemas.action_result import ActionResultRead
from app.schemas.plan import PlanItemRead, PlanRead
from app.schemas.thread import ThreadAggregate, ThreadCreate, ThreadRead
from app.schemas.understanding import (
    AnswerRead,
    CorrectionRead,
    UnderstandingSessionRead,
    UnderstandingSummaryRead,
)


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
        current_plan = self.workflow.get_plan(thread.active_plan_id, self.user_id) if thread.active_plan_id else None
        plan_versions = self.workflow.plan_versions(thread.id)
        latest_action = self.workflow.latest_action_result(thread.id)
        return ThreadAggregate(
            thread=thread,
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
