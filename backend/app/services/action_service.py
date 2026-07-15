from datetime import UTC, datetime

from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.idempotency import IdempotencyManager
from app.engines.context import DecisionContextBuilder
from app.engines.provider import get_decision_engines
from app.engines.schemas import ShadowEvaluationIntent, baseline_output_for
from app.models.action_result import ActionResult
from app.models.goal import Goal
from app.models.hypothesis import Hypothesis
from app.models.understanding import UserCorrection
from app.repositories.workflow import WorkflowRepository
from app.rules.hypothesis_lifecycle import (
    GOAL_FEASIBILITY_CATEGORY,
    goal_feasibility_content,
    hypothesis_semantic_key,
    is_active_hypothesis,
)
from app.rules.workflow_steps import (
    advance_workflow_step,
    later_workflow_step,
    workflow_step_is_at_least,
)
from app.schemas.action_result import (
    ActionResultCreate,
    ActionResultRead,
    ActionSubmissionResult,
    HypothesisRead,
    SystemRevisionRead,
)
from app.schemas.snapshot import SnapshotRead
from app.services.snapshot_service import SnapshotService


class ActionService:
    def __init__(self, session: Session, user_id: str) -> None:
        self.session = session
        self.user_id = user_id
        self.workflow = WorkflowRepository(session)
        self.contexts = DecisionContextBuilder(session, user_id)
        self.shadow_intent: ShadowEvaluationIntent | None = None

    def submit(self, payload: ActionResultCreate, idempotency_key: str) -> dict:
        self.shadow_intent = None
        manager = IdempotencyManager(
            self.session,
            self.user_id,
            "POST /api/action-results",
            idempotency_key,
            payload.model_dump(mode="json"),
        )
        if replay := manager.replay():
            return replay
        thread = self.workflow.get_thread(payload.thread_id, self.user_id)
        if thread is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "任务线程不存在。")
        plan = self.workflow.get_plan(payload.plan_id, self.user_id)
        if plan is None or plan.thread_id != thread.id:
            raise APIError(status.HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND", "计划不存在。")
        if (
            plan.status != "accepted"
            or plan.accepted_at is None
            or thread.active_plan_id != plan.id
            or not workflow_step_is_at_least(thread.current_step, "plan_accepted")
        ):
            raise APIError(
                status.HTTP_409_CONFLICT,
                "PLAN_NOT_ACCEPTED",
                "只有已接受的当前计划才能提交行动反馈。",
                {"current_step": thread.current_step},
            )

        goal = self.session.get(Goal, plan.primary_goal_id)
        goal_outcome = goal.desired_outcome if goal else plan.summary
        context = self.contexts.build(
            decision_type="action_revision",
            thread_id=thread.id,
            action_feedback={
                "plan_id": plan.id,
                "goal": goal_outcome,
                "action": plan.single_action,
                "started": payload.started,
                "completed": payload.completed,
                "progress_percent": payload.progress_percent,
                "actual_duration_minutes": payload.actual_duration_minutes,
                "obstacle_code": payload.obstacle_code,
                "user_note": payload.obstacle_detail,
            },
        )
        decision = get_decision_engines().action.revise(context)
        action = ActionResult(
            user_id=self.user_id,
            thread_id=thread.id,
            plan_id=plan.id,
            idempotency_key=idempotency_key,
            started=payload.started,
            completed=payload.completed,
            progress_percent=payload.progress_percent,
            actual_duration_minutes=payload.actual_duration_minutes,
            obstacle_code=payload.obstacle_code,
            obstacle_detail=payload.obstacle_detail,
            energy_change=payload.energy_change,
            unrealistic_part=payload.unrealistic_part,
            original_judgment=f"当前行动“{plan.single_action}”可以在本阶段推进。",
            actual_result_summary=decision.actual_result,
            revised_judgment=decision.revised_judgment,
            next_adjustment=decision.next_adjustment,
            submitted_at=datetime.now(UTC),
        )
        self.session.add(action)
        self.session.flush()

        hypothesis_content = goal_feasibility_content(goal_outcome)
        semantic_key = hypothesis_semantic_key(GOAL_FEASIBILITY_CATEGORY, hypothesis_content)
        hypothesis = self.workflow.active_hypothesis(thread.id, GOAL_FEASIBILITY_CATEGORY)
        if hypothesis is None:
            hypothesis = self.workflow.hypothesis_by_semantic_key(thread.id, semantic_key)
            if hypothesis is None:
                hypothesis = Hypothesis(
                    user_id=self.user_id,
                    thread_id=thread.id,
                    content=hypothesis_content,
                    category=GOAL_FEASIBILITY_CATEGORY,
                    semantic_key=semantic_key,
                    status="pending",
                    supporting_evidence=[],
                    opposing_evidence=[],
                    requires_confirmation=True,
                )
                self.session.add(hypothesis)
                self.session.flush()
        evidence = {"action_result_id": action.id, "progress_percent": action.progress_percent}
        if is_active_hypothesis(hypothesis):
            hypothesis.status = decision.hypothesis_status
            hypothesis.last_reviewed_at = datetime.now(UTC)
            if decision.hypothesis_status == "denied":
                hypothesis.opposing_evidence = [*hypothesis.opposing_evidence, evidence]
            else:
                hypothesis.supporting_evidence = [*hypothesis.supporting_evidence, evidence]

        correction_text = None
        if payload.unrealistic_part:
            correction_text = payload.unrealistic_part.strip()
            self.session.add(
                UserCorrection(
                    user_id=self.user_id,
                    thread_id=thread.id,
                    target_type="plan",
                    target_id=plan.id,
                    assessment="system_snapshot",
                    previous_value=plan.single_action,
                    user_value=correction_text,
                    system_handling="已用于修正下一行动和系统快照。",
                    has_conflict=False,
                )
            )

        current_snapshot = SnapshotService(self.session, self.user_id).get_current()
        patterns = list(current_snapshot.effective_patterns)
        if not any(item.get("content") == decision.pattern for item in patterns):
            patterns.append({"content": decision.pattern, "maturity": "candidate"})
        hypothesis_payload = [self._hypothesis_frontend(item) for item in self.workflow.active_hypotheses(thread.id)]
        snapshot = SnapshotService(self.session, self.user_id).create_version(
            source_thread_id=thread.id,
            source_action_result_id=action.id,
            current_stage=decision.next_stage,
            current_action=decision.next_adjustment,
            effective_patterns=patterns,
            hypotheses=hypothesis_payload,
            recent_revision=decision.revised_judgment,
            user_correction=correction_text,
            increment_revision=True,
        )
        action_step = later_workflow_step(thread.current_step, "action_pending")
        thread.current_step = (
            action_step if action_step == "system_revised" else advance_workflow_step(action_step, "system_revised")
        )
        thread.status = "active"
        thread.phase = decision.next_stage
        thread.last_activity_at = datetime.now(UTC)
        self.session.flush()

        result = ActionSubmissionResult(
            action_result=ActionResultRead.model_validate(action),
            system_revision=SystemRevisionRead(
                original_judgment=action.original_judgment,
                actual_result=action.actual_result_summary,
                revised_judgment=action.revised_judgment,
                next_adjustment=action.next_adjustment,
            ),
            hypothesis=HypothesisRead.model_validate(hypothesis),
            snapshot=SnapshotRead.model_validate(snapshot),
            current_step="system_revised",
        )
        data = result.model_dump(mode="json")
        manager.store("action_result", action.id, data)
        try:
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise
        self.shadow_intent = ShadowEvaluationIntent(
            decision_type="action_revision",
            user_id=self.user_id,
            thread_id=thread.id,
            context=context,
            baseline_output=baseline_output_for("action_revision", decision, context),
        )
        return data

    @staticmethod
    def _hypothesis_frontend(hypothesis: Hypothesis) -> dict:
        return {"id": hypothesis.id, "content": hypothesis.content, "status": hypothesis.status}
