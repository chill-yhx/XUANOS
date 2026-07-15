from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.models.snapshot import UserSnapshot
from app.models.user import User


def create_user_with_snapshot(session: Session, user_id: str) -> tuple[User, UserSnapshot]:
    user = User(
        id=user_id,
        display_name="XUANOS 用户",
        timezone="Asia/Shanghai",
        consent_version="v0.1",
    )
    session.add(user)
    session.flush()
    snapshot = create_initial_snapshot(session, user)
    return user, snapshot


def ensure_user_snapshot(session: Session, user_id: str) -> tuple[User, UserSnapshot]:
    user = session.get(User, user_id)
    if user is None:
        raise RuntimeError("Authenticated user no longer exists")
    snapshot = session.get(UserSnapshot, user.current_snapshot_id) if user.current_snapshot_id else None
    if snapshot is None:
        snapshot = create_initial_snapshot(session, user)
    elif is_legacy_demo_snapshot(snapshot):
        snapshot = create_initial_snapshot(
            session,
            user,
            version=snapshot.version + 1,
            recent_revisions=("已清除历史开发示例，等待新的真实理解。",),
        )
    return user, snapshot


def create_initial_snapshot(
    session: Session,
    user: User,
    *,
    version: int = 1,
    recent_revisions: Sequence[str] | None = None,
) -> UserSnapshot:
    snapshot = UserSnapshot(
        user_id=user.id,
        version=version,
        current_vector="尚未确认主线",
        current_stage="等待理解",
        current_action="创建第一条任务线程",
        reality_boundaries=[],
        effective_patterns=[],
        hypotheses=[],
        recent_revisions=list(recent_revisions or ("尚未提交理解信息。",)),
        user_corrections=[],
        revision_count=0,
    )
    session.add(snapshot)
    session.flush()
    user.current_snapshot_id = snapshot.id
    session.flush()
    return snapshot


def is_legacy_demo_snapshot(snapshot: UserSnapshot) -> bool:
    """Identify the original seeded demo snapshot without matching its text.

    Existing records remain append-only. The next snapshot is a neutral user
    starting point, so a historical development sample cannot become the basis
    for a new decision.
    """

    return (
        snapshot.version == 1
        and snapshot.source_thread_id is None
        and snapshot.source_action_result_id is None
        and snapshot.revision_count == 0
        and bool(snapshot.reality_boundaries)
        and bool(snapshot.effective_patterns)
        and bool(snapshot.hypotheses)
        and bool(snapshot.recent_revisions)
        and bool(snapshot.user_corrections)
    )
