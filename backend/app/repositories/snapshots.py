from sqlalchemy.orm import Session

from app.models.snapshot import UserSnapshot
from app.models.user import User


class SnapshotRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_current(self, user_id: str) -> UserSnapshot | None:
        user = self.session.get(User, user_id)
        if user is None or user.current_snapshot_id is None:
            return None
        return self.session.get(UserSnapshot, user.current_snapshot_id)
