from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.shadow_evaluation import ShadowEvaluation


class ShadowEvaluationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, evaluation: ShadowEvaluation) -> ShadowEvaluation:
        self.session.add(evaluation)
        self.session.flush()
        return evaluation

    def list_for_user(self, user_id: str, thread_id: str | None = None) -> list[ShadowEvaluation]:
        statement = select(ShadowEvaluation).where(ShadowEvaluation.user_id == user_id)
        if thread_id is not None:
            statement = statement.where(ShadowEvaluation.thread_id == thread_id)
        return list(self.session.scalars(statement.order_by(ShadowEvaluation.created_at, ShadowEvaluation.id)))
