from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.seed import DEMO_USER_ID, ensure_demo_user
from app.models.action_result import ActionResult
from app.models.goal import Constraint, Goal
from app.models.hypothesis import Hypothesis
from app.models.idempotency import IdempotencyRecord
from app.models.plan import Plan, PlanItem
from app.models.snapshot import UserSnapshot
from app.models.thread import Thread
from app.models.understanding import Answer, UnderstandingSession, UserCorrection
from app.models.user import User


class DemoService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def reset(self) -> UserSnapshot:
        self.session.execute(delete(IdempotencyRecord).where(IdempotencyRecord.user_id == DEMO_USER_ID))
        self.session.execute(delete(ActionResult).where(ActionResult.user_id == DEMO_USER_ID))
        demo_plan_ids = select(Plan.id).where(Plan.user_id == DEMO_USER_ID)
        self.session.execute(delete(PlanItem).where(PlanItem.plan_id.in_(demo_plan_ids)))
        self.session.execute(delete(Plan).where(Plan.user_id == DEMO_USER_ID))
        self.session.execute(delete(Constraint).where(Constraint.user_id == DEMO_USER_ID))
        self.session.execute(delete(Goal).where(Goal.user_id == DEMO_USER_ID))
        self.session.execute(delete(Hypothesis).where(Hypothesis.user_id == DEMO_USER_ID))
        self.session.execute(delete(UserCorrection).where(UserCorrection.user_id == DEMO_USER_ID))
        self.session.execute(
            delete(Answer).where(
                Answer.understanding_session_id.in_(
                    select(UnderstandingSession.id).where(UnderstandingSession.user_id == DEMO_USER_ID)
                )
            )
        )
        self.session.execute(delete(UnderstandingSession).where(UnderstandingSession.user_id == DEMO_USER_ID))
        self.session.execute(delete(Thread).where(Thread.user_id == DEMO_USER_ID))
        self.session.execute(delete(UserSnapshot).where(UserSnapshot.user_id == DEMO_USER_ID))
        self.session.execute(delete(User).where(User.id == DEMO_USER_ID))
        _, snapshot = ensure_demo_user(self.session)
        self.session.commit()
        self.session.refresh(snapshot)
        return snapshot
