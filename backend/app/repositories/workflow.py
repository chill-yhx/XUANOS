from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.action_result import ActionResult
from app.models.goal import Goal
from app.models.hypothesis import Hypothesis
from app.models.plan import Plan, PlanItem
from app.models.thread import Thread
from app.models.understanding import Answer, UnderstandingSession, UserCorrection


class WorkflowRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_thread(self, thread_id: str, user_id: str) -> Thread | None:
        return self.session.scalar(select(Thread).where(Thread.id == thread_id, Thread.user_id == user_id))

    def get_understanding(self, session_id: str, user_id: str) -> UnderstandingSession | None:
        return self.session.scalar(
            select(UnderstandingSession).where(
                UnderstandingSession.id == session_id,
                UnderstandingSession.user_id == user_id,
            )
        )

    def current_answers(self, session_id: str) -> list[Answer]:
        statement = (
            select(Answer)
            .where(Answer.understanding_session_id == session_id, Answer.is_current.is_(True))
            .order_by(Answer.question_order)
        )
        return list(self.session.scalars(statement))

    def current_answer(self, session_id: str, question_id: str) -> Answer | None:
        return self.session.scalar(
            select(Answer).where(
                Answer.understanding_session_id == session_id,
                Answer.question_id == question_id,
                Answer.is_current.is_(True),
            )
        )

    def goal_for_understanding(self, understanding_session_id: str) -> Goal | None:
        return self.session.scalar(
            select(Goal).where(
                Goal.understanding_session_id == understanding_session_id,
                Goal.priority == "primary",
            )
        )

    def get_plan(self, plan_id: str, user_id: str) -> Plan | None:
        return self.session.scalar(select(Plan).where(Plan.id == plan_id, Plan.user_id == user_id))

    def plan_items(self, plan_id: str) -> list[PlanItem]:
        return list(
            self.session.scalars(select(PlanItem).where(PlanItem.plan_id == plan_id).order_by(PlanItem.sort_order))
        )

    def plan_versions(self, thread_id: str) -> list[Plan]:
        return list(self.session.scalars(select(Plan).where(Plan.thread_id == thread_id).order_by(Plan.version)))

    def corrections(self, thread_id: str, limit: int = 20) -> list[UserCorrection]:
        return list(
            self.session.scalars(
                select(UserCorrection)
                .where(UserCorrection.thread_id == thread_id)
                .order_by(UserCorrection.created_at.desc())
                .limit(limit)
            )
        )

    def latest_action_result(self, thread_id: str) -> ActionResult | None:
        return self.session.scalar(
            select(ActionResult)
            .where(ActionResult.thread_id == thread_id)
            .order_by(ActionResult.submitted_at.desc())
            .limit(1)
        )

    def hypothesis(self, thread_id: str, category: str) -> Hypothesis | None:
        return self.session.scalar(
            select(Hypothesis).where(Hypothesis.thread_id == thread_id, Hypothesis.category == category)
        )

    def hypotheses(self, thread_id: str) -> list[Hypothesis]:
        return list(self.session.scalars(select(Hypothesis).where(Hypothesis.thread_id == thread_id)))
