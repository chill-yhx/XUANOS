from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.thread import Thread


class ThreadRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, thread: Thread) -> Thread:
        self.session.add(thread)
        self.session.flush()
        return thread

    def get_for_user(self, thread_id: str, user_id: str) -> Thread | None:
        statement = select(Thread).where(Thread.id == thread_id, Thread.user_id == user_id)
        return self.session.scalar(statement)

    def list_for_user(self, user_id: str, limit: int, status: str | None = None) -> list[Thread]:
        statement: Select[tuple[Thread]] = select(Thread).where(Thread.user_id == user_id)
        if status:
            statement = statement.where(Thread.status == status)
        statement = statement.order_by(Thread.last_activity_at.desc(), Thread.id.desc()).limit(limit)
        return list(self.session.scalars(statement))
