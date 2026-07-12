from copy import deepcopy

from sqlalchemy.orm import Session

from app.db.seed import DEMO_USER_ID, ensure_demo_user
from app.models.snapshot import UserSnapshot
from app.models.user import User
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

    def create_version(
        self,
        *,
        source_thread_id: str,
        source_action_result_id: str | None = None,
        current_vector: str | None = None,
        current_stage: str | None = None,
        current_action: str | None = None,
        reality_boundaries: list[str] | None = None,
        effective_patterns: list[dict] | None = None,
        hypotheses: list[dict] | None = None,
        recent_revision: str | None = None,
        user_correction: str | None = None,
        increment_revision: bool = False,
    ) -> UserSnapshot:
        current = self.snapshots.get_current(DEMO_USER_ID)
        if current is None:
            _, current = ensure_demo_user(self.session)

        revisions = deepcopy(current.recent_revisions)
        if recent_revision:
            revisions = [recent_revision, *revisions][:5]
        corrections = deepcopy(current.user_corrections)
        if user_correction:
            corrections = [user_correction, *corrections][:10]

        snapshot = UserSnapshot(
            user_id=DEMO_USER_ID,
            version=current.version + 1,
            source_thread_id=source_thread_id,
            source_action_result_id=source_action_result_id,
            current_vector=current_vector or current.current_vector,
            current_stage=current_stage or current.current_stage,
            current_action=current_action or current.current_action,
            reality_boundaries=deepcopy(reality_boundaries or current.reality_boundaries),
            effective_patterns=deepcopy(effective_patterns or current.effective_patterns),
            hypotheses=deepcopy(hypotheses or current.hypotheses),
            recent_revisions=revisions,
            user_corrections=corrections,
            revision_count=current.revision_count + (1 if increment_revision else 0),
        )
        self.session.add(snapshot)
        self.session.flush()
        user = self.session.get(User, DEMO_USER_ID)
        if user is None:
            raise RuntimeError("demo-user must exist before creating a snapshot")
        user.current_snapshot_id = snapshot.id
        self.session.flush()
        return snapshot
