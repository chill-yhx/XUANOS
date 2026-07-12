from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db.seed import DEMO_USER_ID, ensure_demo_user
from app.models.snapshot import UserSnapshot
from app.models.thread import Thread
from app.models.user import User


class DemoService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def reset(self) -> UserSnapshot:
        self.session.execute(delete(Thread).where(Thread.user_id == DEMO_USER_ID))
        self.session.execute(delete(UserSnapshot).where(UserSnapshot.user_id == DEMO_USER_ID))
        self.session.execute(delete(User).where(User.id == DEMO_USER_ID))
        _, snapshot = ensure_demo_user(self.session)
        self.session.commit()
        self.session.refresh(snapshot)
        return snapshot
