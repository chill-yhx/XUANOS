from sqlalchemy.orm import Session

from app.db.seed import DEMO_USER_ID, ensure_demo_user
from app.models.snapshot import UserSnapshot
from app.repositories.snapshots import SnapshotRepository


class SnapshotService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.snapshots = SnapshotRepository(session)

    def get_current(self) -> UserSnapshot:
        snapshot = self.snapshots.get_current(DEMO_USER_ID)
        if snapshot is None:
            _, snapshot = ensure_demo_user(self.session)
            self.session.commit()
        return snapshot
