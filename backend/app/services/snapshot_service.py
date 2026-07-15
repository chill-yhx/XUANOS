from copy import deepcopy

from sqlalchemy.orm import Session

from app.db.seed import ensure_user_snapshot
from app.models.snapshot import UserSnapshot
from app.models.user import User
from app.repositories.snapshots import SnapshotRepository


class SnapshotService:
    def __init__(self, session: Session, user_id: str) -> None:
        self.session = session
        self.user_id = user_id
        self.snapshots = SnapshotRepository(session)

    def get_current(self) -> UserSnapshot:
        current = self.snapshots.get_current(self.user_id)
        _, snapshot = ensure_user_snapshot(self.session, self.user_id)
        if snapshot is not current:
            self.session.commit()
        return snapshot

    def create_version(
        self,
        *,
        source_thread_id: str | None,
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
        _, current = ensure_user_snapshot(self.session, self.user_id)

        revisions = deepcopy(current.recent_revisions)
        if recent_revision:
            revisions = [recent_revision, *revisions][:5]
        corrections = deepcopy(current.user_corrections)
        if user_correction:
            corrections = [user_correction, *corrections][:10]

        snapshot = UserSnapshot(
            user_id=self.user_id,
            version=current.version + 1,
            source_thread_id=source_thread_id,
            source_action_result_id=source_action_result_id,
            current_vector=current.current_vector if current_vector is None else current_vector,
            current_stage=current.current_stage if current_stage is None else current_stage,
            current_action=current.current_action if current_action is None else current_action,
            reality_boundaries=deepcopy(
                current.reality_boundaries if reality_boundaries is None else reality_boundaries
            ),
            effective_patterns=deepcopy(
                current.effective_patterns if effective_patterns is None else effective_patterns
            ),
            hypotheses=deepcopy(current.hypotheses if hypotheses is None else hypotheses),
            recent_revisions=revisions,
            user_corrections=corrections,
            revision_count=current.revision_count + (1 if increment_revision else 0),
        )
        self.session.add(snapshot)
        self.session.flush()
        user = self.session.get(User, self.user_id)
        if user is None:
            raise RuntimeError("Authenticated user must exist before creating a snapshot")
        user.current_snapshot_id = snapshot.id
        self.session.flush()
        return snapshot
