from datetime import UTC, datetime

from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.idempotency import IdempotencyManager
from app.db.base import new_id
from app.db.seed import DEMO_USER_ID
from app.models.goal import Goal
from app.models.plan import Plan, PlanItem
from app.models.understanding import UserCorrection
from app.repositories.workflow import WorkflowRepository
from app.rules.plan_mock import generate_plan, modification_impact
from app.schemas.plan import (
    PlanAcceptRequest,
    PlanAcceptResult,
    PlanCreateRequest,
    PlanCreateResult,
    PlanItemRead,
    PlanRead,
    PlanReviseRequest,
    PlanReviseResult,
)
from app.schemas.snapshot import SnapshotRead
from app.services.snapshot_service import SnapshotService


class PlanService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.workflow = WorkflowRepository(session)

    def create(self, payload: PlanCreateRequest, idempotency_key: str) -> dict:
        manager = IdempotencyManager(self.session, "POST /api/plans", idempotency_key, payload.model_dump(mode="json"))
        if replay := manager.replay():
            return replay
        thread = self._thread(payload.thread_id)
        understanding = self.workflow.get_understanding(payload.understanding_session_id, DEMO_USER_ID)
        if understanding is None or understanding.thread_id != thread.id:
            raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "理解会话不存在。")
        if understanding.status != "confirmed" or thread.current_step != "understanding_confirmed":
            raise APIError(
                status.HTTP_409_CONFLICT,
                "UNDERSTANDING_NOT_CONFIRMED",
                "理解尚未确认，不能生成计划。",
                {"current_step": thread.current_step},
            )
        goal = self.workflow.goal_for_understanding(understanding.id)
        if goal is None:
            raise APIError(status.HTTP_409_CONFLICT, "INVALID_FLOW_STATE", "已确认理解缺少主目标。")

        decision = generate_plan(understanding.real_goal or goal.desired_outcome)
        plan_id = new_id()
        plan = Plan(
            id=plan_id,
            root_plan_id=plan_id,
            thread_id=thread.id,
            user_id=DEMO_USER_ID,
            understanding_session_id=understanding.id,
            primary_goal_id=goal.id,
            version=1,
            status="generated",
            stage=decision.stage,
            summary=decision.summary,
            single_action=decision.single_action,
            completion_standard=decision.completion_standard,
            review_condition=decision.review_condition,
            workload=decision.workload,
            system_recommendation=decision.system_recommendation,
            is_user_final_choice=False,
            warning_level="info",
        )
        self.session.add(plan)
        self.session.flush()
        for item in decision.items:
            self.session.add(PlanItem(plan_id=plan.id, goal_id=goal.id, **item))
        thread.active_plan_id = plan.id
        thread.current_step = "plan_generated"
        thread.phase = "计划裁决"
        thread.last_activity_at = datetime.now(UTC)
        SnapshotService(self.session).create_version(
            source_thread_id=thread.id,
            current_stage="计划待确认",
            recent_revision="计划 v1 已生成，等待用户确认。",
        )
        self.session.flush()

        result = PlanCreateResult(plan=self._plan_read(plan), current_step="plan_generated")
        data = result.model_dump(mode="json")
        manager.store("plan", plan.id, data)
        self.session.commit()
        return data

    def revise(self, plan_id: str, payload: PlanReviseRequest, idempotency_key: str) -> dict:
        manager = IdempotencyManager(
            self.session,
            f"POST /api/plans/{plan_id}/revise",
            idempotency_key,
            payload.model_dump(mode="json"),
        )
        if replay := manager.replay():
            return replay
        previous = self._plan(plan_id)
        thread = self._thread(previous.thread_id)
        if thread.active_plan_id != previous.id or previous.version != payload.expected_version:
            raise APIError(
                status.HTTP_409_CONFLICT,
                "VERSION_CONFLICT",
                "计划版本已变化，请读取最新版本后重试。",
                {"active_plan_id": thread.active_plan_id},
            )
        if previous.status not in {"generated", "accepted"}:
            raise APIError(status.HTTP_409_CONFLICT, "INVALID_FLOW_STATE", "当前计划状态不允许修改。")
        if not payload.expected_impact_acknowledged:
            raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "必须确认预计影响。")

        impact, warning = modification_impact(payload.reason)
        current = Plan(
            id=new_id(),
            root_plan_id=previous.root_plan_id,
            previous_plan_id=previous.id,
            thread_id=previous.thread_id,
            user_id=previous.user_id,
            understanding_session_id=previous.understanding_session_id,
            primary_goal_id=previous.primary_goal_id,
            version=previous.version + 1,
            status="generated",
            stage=previous.stage,
            summary=previous.summary,
            single_action=payload.user_final_choice.strip(),
            completion_standard=previous.completion_standard,
            review_condition=previous.review_condition,
            workload=previous.workload,
            system_recommendation=previous.system_recommendation,
            is_user_final_choice=True,
            user_final_choice=payload.user_final_choice.strip(),
            modification_reason=payload.reason,
            expected_impact=impact,
            warning_level=warning,
        )
        self.session.add(current)
        self.session.flush()
        for item in self.workflow.plan_items(previous.id):
            title = payload.user_final_choice.strip() if item.item_type == "action" else item.title
            self.session.add(
                PlanItem(
                    plan_id=current.id,
                    goal_id=item.goal_id,
                    item_type=item.item_type,
                    title=title,
                    time_block=item.time_block,
                    estimated_minutes=item.estimated_minutes,
                    difficulty=item.difficulty,
                    completion_standard=item.completion_standard,
                    is_optional=item.is_optional,
                    source="user" if item.item_type == "action" else item.source,
                    is_user_modified=item.item_type == "action" or item.is_user_modified,
                    modification_note=impact if item.item_type == "action" else item.modification_note,
                    sort_order=item.sort_order,
                )
            )
        previous.status = "superseded"
        correction = UserCorrection(
            user_id=DEMO_USER_ID,
            thread_id=thread.id,
            target_type="plan",
            target_id=previous.id,
            assessment="system_snapshot",
            previous_value=previous.single_action,
            user_value=payload.user_final_choice.strip(),
            reason=payload.reason,
            system_handling=f"已创建计划 v{current.version}，并保留预计影响与复查条件。",
            has_conflict=False,
        )
        self.session.add(correction)
        thread.active_plan_id = current.id
        thread.current_step = "plan_modified"
        thread.phase = "等待接受"
        thread.last_activity_at = datetime.now(UTC)
        SnapshotService(self.session).create_version(
            source_thread_id=thread.id,
            current_stage="计划待确认",
            recent_revision=f"用户修改计划，生成 v{current.version}。",
            user_correction=payload.user_final_choice.strip(),
        )
        self.session.flush()

        result = PlanReviseResult(
            previous_plan=self._plan_read(previous),
            current_plan=self._plan_read(current),
            current_step="plan_modified",
        )
        data = result.model_dump(mode="json")
        manager.store("plan", current.id, data)
        self.session.commit()
        return data

    def accept(self, plan_id: str, payload: PlanAcceptRequest, idempotency_key: str) -> dict:
        manager = IdempotencyManager(
            self.session,
            f"POST /api/plans/{plan_id}/accept",
            idempotency_key,
            payload.model_dump(mode="json"),
        )
        if replay := manager.replay():
            return replay
        plan = self._plan(plan_id)
        thread = self._thread(plan.thread_id)
        if thread.active_plan_id != plan.id or plan.version != payload.expected_version:
            raise APIError(status.HTTP_409_CONFLICT, "VERSION_CONFLICT", "只能接受当前计划版本。")
        if plan.status not in {"generated", "accepted"}:
            raise APIError(status.HTTP_409_CONFLICT, "INVALID_FLOW_STATE", "当前计划状态不允许接受。")

        if plan.status == "accepted":
            snapshot = SnapshotService(self.session).get_current()
            result = PlanAcceptResult(
                plan=self._plan_read(plan),
                snapshot=SnapshotRead.model_validate(snapshot),
                current_step="plan_accepted",
            )
            data = result.model_dump(mode="json")
            manager.store("plan", plan.id, data)
            self.session.commit()
            return data

        plan.status = "accepted"
        plan.accepted_at = plan.accepted_at or datetime.now(UTC)
        thread.status = "waiting_action"
        thread.current_step = "plan_accepted"
        thread.phase = plan.stage
        thread.last_activity_at = datetime.now(UTC)
        snapshot = SnapshotService(self.session).create_version(
            source_thread_id=thread.id,
            current_vector=self._goal_outcome(plan),
            current_stage=plan.stage,
            current_action=plan.single_action,
            recent_revision=f"计划 v{plan.version} 已接受。",
        )
        self.session.flush()

        result = PlanAcceptResult(
            plan=self._plan_read(plan),
            snapshot=SnapshotRead.model_validate(snapshot),
            current_step="plan_accepted",
        )
        data = result.model_dump(mode="json")
        manager.store("plan", plan.id, data)
        self.session.commit()
        return data

    def _thread(self, thread_id: str):
        thread = self.workflow.get_thread(thread_id, DEMO_USER_ID)
        if thread is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "任务线程不存在。")
        return thread

    def _plan(self, plan_id: str) -> Plan:
        plan = self.workflow.get_plan(plan_id, DEMO_USER_ID)
        if plan is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "计划不存在。")
        return plan

    def _plan_read(self, plan: Plan) -> PlanRead:
        data = PlanRead.model_validate(plan)
        data.items = [PlanItemRead.model_validate(item) for item in self.workflow.plan_items(plan.id)]
        return data

    def _goal_outcome(self, plan: Plan) -> str:
        goal = self.session.get(Goal, plan.primary_goal_id)
        return goal.desired_outcome if goal else plan.summary
