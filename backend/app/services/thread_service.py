from fastapi import status
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.db.seed import DEMO_USER_ID, ensure_demo_user
from app.models.thread import Thread
from app.repositories.snapshots import SnapshotRepository
from app.repositories.threads import ThreadRepository
from app.schemas.thread import ThreadAggregate, ThreadCreate


class ThreadService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.threads = ThreadRepository(session)
        self.snapshots = SnapshotRepository(session)

    def create(self, payload: ThreadCreate) -> Thread:
        ensure_demo_user(self.session)
        thread = self.threads.add(Thread(user_id=DEMO_USER_ID, title=payload.title.strip()))
        self.session.commit()
        self.session.refresh(thread)
        return thread

    def list(self, limit: int, thread_status: str | None = None) -> list[Thread]:
        ensure_demo_user(self.session)
        self.session.commit()
        return self.threads.list_for_user(DEMO_USER_ID, limit, thread_status)

    def get_aggregate(self, thread_id: str) -> ThreadAggregate:
        thread = self.threads.get_for_user(thread_id, DEMO_USER_ID)
        if thread is None:
            raise APIError(
                status.HTTP_404_NOT_FOUND,
                "RESOURCE_NOT_FOUND",
                "任务线程不存在。",
                {"thread_id": thread_id},
            )
        snapshot = self.snapshots.get_current(DEMO_USER_ID)
        if snapshot is None:
            _, snapshot = ensure_demo_user(self.session)
            self.session.commit()
        return ThreadAggregate(thread=thread, current_snapshot=snapshot)
