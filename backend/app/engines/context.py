from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engines.schemas import DecisionQuestion, DecisionType
from app.models.action_result import ActionResult
from app.models.goal import Constraint, Goal
from app.models.hypothesis import Hypothesis
from app.models.plan import Plan, PlanItem
from app.models.snapshot import UserSnapshot
from app.models.thread import Thread
from app.models.understanding import Answer, UnderstandingSession, UserCorrection
from app.models.user import User


class DecisionContext(BaseModel):
    """Immutable, source-labeled input shared by baseline and shadow engines."""

    model_config = ConfigDict(extra="forbid")

    decision_type: DecisionType
    user_id: str
    thread_id: str
    original_expression: str | None = None
    current_question: dict[str, str] | None = None
    answers: list[dict[str, Any]] = Field(default_factory=list)
    confirmed_understanding: dict[str, str] | None = None
    success_criteria: str | None = None
    goals: list[dict[str, Any]] = Field(default_factory=list)
    constraints: list[dict[str, Any]] = Field(default_factory=list)
    snapshot: dict[str, Any] | None = None
    hypotheses: list[dict[str, Any]] = Field(default_factory=list)
    action_results: list[dict[str, Any]] = Field(default_factory=list)
    user_corrections: list[dict[str, Any]] = Field(default_factory=list)
    mentor_preferences: dict[str, Any] = Field(default_factory=dict)
    historical_version_summary: dict[str, Any] = Field(default_factory=dict)
    user_facts: dict[str, Any] = Field(default_factory=dict)
    user_claims: list[dict[str, Any]] = Field(default_factory=list)
    system_hypotheses: list[dict[str, Any]] = Field(default_factory=list)
    unknown_information: list[str] = Field(default_factory=list)
    action_feedback: dict[str, Any] | None = None

    def answer_map(self) -> dict[str, str]:
        return {
            str(answer["question_id"]): str(answer["answer_text"])
            for answer in self.answers
            if answer.get("question_id") and answer.get("answer_text")
        }

    def primary_goal(self) -> str:
        if self.confirmed_understanding and self.confirmed_understanding.get("real_goal"):
            return self.confirmed_understanding["real_goal"]
        for goal in self.goals:
            if goal.get("priority") == "primary" and goal.get("desired_outcome"):
                return str(goal["desired_outcome"])
        return self.original_expression or "当前目标"

    def foundation(self) -> str:
        if self.confirmed_understanding and self.confirmed_understanding.get("foundation"):
            return self.confirmed_understanding["foundation"]
        return self.answer_map().get("current_foundation", "")

    def constraints_text(self) -> str:
        if self.confirmed_understanding and self.confirmed_understanding.get("constraints"):
            return self.confirmed_understanding["constraints"]
        if values := [str(item["content"]) for item in self.constraints if item.get("content")]:
            return "；".join(values)
        return self.answer_map().get("real_constraints", "")


class DecisionContextBuilder:
    """Builds one source-labeled context snapshot before a decision is made."""

    def __init__(self, session: Session, user_id: str) -> None:
        self.session = session
        self.user_id = user_id

    def build(
        self,
        *,
        decision_type: DecisionType,
        thread_id: str,
        understanding: UnderstandingSession | None = None,
        current_question: DecisionQuestion | None = None,
        action_feedback: dict[str, Any] | None = None,
    ) -> DecisionContext:
        thread = self.session.scalar(select(Thread).where(Thread.id == thread_id, Thread.user_id == self.user_id))
        user = self.session.get(User, self.user_id)
        if thread is None or user is None:
            raise ValueError("Decision context requires an authenticated user and owned thread")

        active_understanding = understanding
        if active_understanding is None and thread.active_understanding_session_id:
            active_understanding = self.session.scalar(
                select(UnderstandingSession).where(
                    UnderstandingSession.id == thread.active_understanding_session_id,
                    UnderstandingSession.user_id == self.user_id,
                )
            )

        answers = self._answers(active_understanding)
        goals = self._goals(thread_id)
        constraints = self._constraints(thread_id)
        plans = self._plans(thread_id)
        action_results = self._action_results(thread_id)
        corrections = self._corrections(thread_id)
        hypotheses = self._hypotheses(thread_id)
        snapshot = self._snapshot(user)
        confirmed = self._confirmed_understanding(active_understanding)
        primary_goal = next((goal for goal in goals if goal.get("priority") == "primary"), None)

        unknown = self._unknown_information(active_understanding, answers, confirmed, primary_goal)
        user_claims = self._user_claims(active_understanding, answers)
        user_facts = {
            "confirmed_understanding": confirmed,
            "goals": [goal for goal in goals if goal.get("user_confirmed")],
            "constraints": [constraint for constraint in constraints if constraint.get("user_confirmed")],
            "action_results": action_results,
            "user_corrections": corrections,
        }
        system_hypotheses = [
            {
                "id": item["id"],
                "content": item["content"],
                "status": item["status"],
                "confidence_internal": item["confidence_internal"],
                "requires_confirmation": item["requires_confirmation"],
                "source": "system_hypothesis",
            }
            for item in hypotheses
        ]

        return DecisionContext(
            decision_type=decision_type,
            user_id=self.user_id,
            thread_id=thread_id,
            original_expression=active_understanding.user_input if active_understanding else None,
            current_question=(
                {"id": current_question.id, "prompt": current_question.prompt, "hint": current_question.hint}
                if current_question
                else None
            ),
            answers=answers,
            confirmed_understanding=confirmed,
            success_criteria=primary_goal.get("success_criteria") if primary_goal else None,
            goals=goals,
            constraints=constraints,
            snapshot=snapshot,
            hypotheses=hypotheses,
            action_results=action_results,
            user_corrections=corrections,
            mentor_preferences={"status": "not_collected", "source": "unknown"},
            historical_version_summary={
                "understanding_summary_version": active_understanding.summary_version if active_understanding else 0,
                "plan_versions": [
                    {
                        "id": plan["id"],
                        "version": plan["version"],
                        "status": plan["status"],
                        "single_action": plan["single_action"],
                    }
                    for plan in plans
                ],
                "snapshot_version": snapshot.get("version") if snapshot else None,
                "action_result_count": len(action_results),
                "correction_count": len(corrections),
            },
            user_facts=user_facts,
            user_claims=user_claims,
            system_hypotheses=system_hypotheses,
            unknown_information=unknown,
            action_feedback=action_feedback,
        )

    def _answers(self, understanding: UnderstandingSession | None) -> list[dict[str, Any]]:
        if understanding is None:
            return []
        rows = self.session.scalars(
            select(Answer)
            .where(Answer.understanding_session_id == understanding.id, Answer.is_current.is_(True))
            .order_by(Answer.question_order)
        )
        return [
            {
                "id": answer.id,
                "question_id": answer.question_id,
                "question_text": answer.question_text,
                "answer_text": answer.answer_text,
                "question_order": answer.question_order,
                "source": "user_claim",
            }
            for answer in rows
        ]

    def _goals(self, thread_id: str) -> list[dict[str, Any]]:
        rows = self.session.scalars(
            select(Goal)
            .where(Goal.thread_id == thread_id, Goal.user_id == self.user_id)
            .order_by(Goal.created_at, Goal.id)
        )
        return [
            {
                "id": goal.id,
                "title": goal.title,
                "desired_outcome": goal.desired_outcome,
                "success_criteria": goal.success_criteria,
                "priority": goal.priority,
                "status": goal.status,
                "user_confirmed": goal.user_confirmed,
                "source": "user_confirmed" if goal.user_confirmed else "system_projection",
            }
            for goal in rows
        ]

    def _constraints(self, thread_id: str) -> list[dict[str, Any]]:
        rows = self.session.scalars(
            select(Constraint)
            .where(Constraint.thread_id == thread_id, Constraint.user_id == self.user_id)
            .order_by(Constraint.created_at, Constraint.id)
        )
        return [
            {
                "id": constraint.id,
                "content": constraint.content,
                "constraint_type": constraint.constraint_type,
                "severity": constraint.severity,
                "is_hard": constraint.is_hard,
                "user_confirmed": constraint.user_confirmed,
                "source": constraint.source_type,
            }
            for constraint in rows
        ]

    def _plans(self, thread_id: str) -> list[dict[str, Any]]:
        plans = list(
            self.session.scalars(
                select(Plan).where(Plan.thread_id == thread_id, Plan.user_id == self.user_id).order_by(Plan.version)
            )
        )
        if not plans:
            return []
        plan_items = list(
            self.session.scalars(
                select(PlanItem).where(PlanItem.plan_id.in_([plan.id for plan in plans])).order_by(PlanItem.sort_order)
            )
        )
        items_by_plan: dict[str, list[dict[str, Any]]] = {plan.id: [] for plan in plans}
        for item in plan_items:
            items_by_plan[item.plan_id].append(
                {
                    "item_type": item.item_type,
                    "title": item.title,
                    "estimated_minutes": item.estimated_minutes,
                    "completion_standard": item.completion_standard,
                }
            )
        return [
            {
                "id": plan.id,
                "root_plan_id": plan.root_plan_id,
                "version": plan.version,
                "status": plan.status,
                "stage": plan.stage,
                "summary": plan.summary,
                "single_action": plan.single_action,
                "completion_standard": plan.completion_standard,
                "review_condition": plan.review_condition,
                "items": items_by_plan[plan.id],
            }
            for plan in plans
        ]

    def _action_results(self, thread_id: str) -> list[dict[str, Any]]:
        rows = self.session.scalars(
            select(ActionResult)
            .where(ActionResult.thread_id == thread_id, ActionResult.user_id == self.user_id)
            .order_by(ActionResult.submitted_at.desc(), ActionResult.id.desc())
            .limit(20)
        )
        return [
            {
                "id": result.id,
                "plan_id": result.plan_id,
                "started": result.started,
                "completed": result.completed,
                "progress_percent": result.progress_percent,
                "actual_duration_minutes": result.actual_duration_minutes,
                "obstacle_code": result.obstacle_code,
                "user_note": result.obstacle_detail,
                "submitted_at": result.submitted_at,
                "source": "action_evidence",
            }
            for result in rows
        ]

    def _corrections(self, thread_id: str) -> list[dict[str, Any]]:
        rows = self.session.scalars(
            select(UserCorrection)
            .where(UserCorrection.thread_id == thread_id, UserCorrection.user_id == self.user_id)
            .order_by(UserCorrection.created_at.desc(), UserCorrection.id.desc())
            .limit(20)
        )
        return [
            {
                "id": correction.id,
                "target_type": correction.target_type,
                "assessment": correction.assessment,
                "previous_value": correction.previous_value,
                "user_value": correction.user_value,
                "reason": correction.reason,
                "source": "user_correction",
            }
            for correction in rows
        ]

    def _hypotheses(self, thread_id: str) -> list[dict[str, Any]]:
        rows = self.session.scalars(
            select(Hypothesis)
            .where(Hypothesis.thread_id == thread_id, Hypothesis.user_id == self.user_id)
            .order_by(Hypothesis.created_at, Hypothesis.id)
        )
        return [
            {
                "id": hypothesis.id,
                "content": hypothesis.content,
                "category": hypothesis.category,
                "status": hypothesis.status,
                "confidence_internal": hypothesis.confidence_internal,
                "requires_confirmation": hypothesis.requires_confirmation,
                "user_attitude": hypothesis.user_attitude,
                "source": "system_hypothesis",
            }
            for hypothesis in rows
        ]

    def _snapshot(self, user: User) -> dict[str, Any] | None:
        if not user.current_snapshot_id:
            return None
        snapshot = self.session.get(UserSnapshot, user.current_snapshot_id)
        if snapshot is None:
            return None
        return self._snapshot_payload(snapshot)

    @staticmethod
    def _snapshot_payload(snapshot: UserSnapshot) -> dict[str, Any]:
        return {
            "id": snapshot.id,
            "version": snapshot.version,
            "current_vector": snapshot.current_vector,
            "current_stage": snapshot.current_stage,
            "current_action": snapshot.current_action,
            "reality_boundaries": snapshot.reality_boundaries,
            "effective_patterns": snapshot.effective_patterns,
            "hypotheses": snapshot.hypotheses,
            "source": "system_projection",
        }

    @staticmethod
    def _confirmed_understanding(understanding: UnderstandingSession | None) -> dict[str, str] | None:
        if understanding is None or understanding.status != "confirmed" or not understanding.real_goal:
            return None
        return {
            "real_goal": understanding.real_goal,
            "foundation": understanding.foundation or "",
            "constraints": understanding.constraints_summary or "",
            "tension": understanding.tension or "",
            "uncertain": understanding.uncertain or "",
        }

    @staticmethod
    def _user_claims(
        understanding: UnderstandingSession | None,
        answers: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        claims = [
            {
                "type": "original_expression",
                "value": understanding.user_input,
                "source": "user_claim",
            }
            for _ in [None]
            if understanding and understanding.user_input
        ]
        claims.extend(
            {
                "type": "answer",
                "question_id": answer["question_id"],
                "value": answer["answer_text"],
                "source": "user_claim",
            }
            for answer in answers
        )
        return claims

    @staticmethod
    def _unknown_information(
        understanding: UnderstandingSession | None,
        answers: list[dict[str, Any]],
        confirmed: dict[str, str] | None,
        primary_goal: dict[str, Any] | None,
    ) -> list[str]:
        answer_ids = {str(answer["question_id"]) for answer in answers}
        unknown: list[str] = ["mentor_preferences_not_collected"]
        if understanding is None or not understanding.user_input:
            unknown.append("original_expression_missing")
        if "current_foundation" not in answer_ids and not (confirmed and confirmed.get("foundation")):
            unknown.append("current_foundation_missing")
        if "real_constraints" not in answer_ids and not (confirmed and confirmed.get("constraints")):
            unknown.append("real_constraints_missing")
        if primary_goal is None:
            unknown.append("success_criteria_missing")
        return unknown
