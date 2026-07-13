from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.seed import ensure_user_snapshot
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
    def __init__(self, session: Session, user_id: str) -> None:
        self.session = session
        self.user_id = user_id

    def reset(self) -> UserSnapshot:
        user = self.session.get(User, self.user_id)
        if user is None:
            raise RuntimeError("Authenticated user no longer exists")

        self.session.execute(delete(IdempotencyRecord).where(IdempotencyRecord.user_id == self.user_id))
        self.session.execute(delete(ActionResult).where(ActionResult.user_id == self.user_id))
        user_plan_ids = select(Plan.id).where(Plan.user_id == self.user_id)
        self.session.execute(delete(PlanItem).where(PlanItem.plan_id.in_(user_plan_ids)))
        self.session.execute(delete(Plan).where(Plan.user_id == self.user_id))
        self.session.execute(delete(Constraint).where(Constraint.user_id == self.user_id))
        self.session.execute(delete(Goal).where(Goal.user_id == self.user_id))
        self.session.execute(delete(Hypothesis).where(Hypothesis.user_id == self.user_id))
        self.session.execute(delete(UserCorrection).where(UserCorrection.user_id == self.user_id))
        self.session.execute(
            delete(Answer).where(
                Answer.understanding_session_id.in_(
                    select(UnderstandingSession.id).where(UnderstandingSession.user_id == self.user_id)
                )
            )
        )
        self.session.execute(delete(UnderstandingSession).where(UnderstandingSession.user_id == self.user_id))
        self.session.execute(delete(Thread).where(Thread.user_id == self.user_id))
        user.current_snapshot_id = None
        self.session.flush()
        self.session.execute(delete(UserSnapshot).where(UserSnapshot.user_id == self.user_id))
        _, snapshot = ensure_user_snapshot(self.session, self.user_id)
        self.session.commit()
        self.session.refresh(snapshot)
        return snapshot
