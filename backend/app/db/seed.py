from sqlalchemy.orm import Session

from app.models.snapshot import UserSnapshot
from app.models.user import User


def create_user_with_snapshot(session: Session, user_id: str) -> tuple[User, UserSnapshot]:
    user = User(
        id=user_id,
        display_name="XUANOS 测试用户",
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
    return user, snapshot


def create_initial_snapshot(session: Session, user: User) -> UserSnapshot:
    snapshot = UserSnapshot(
        user_id=user.id,
        version=1,
        current_vector="完成 XUANOS 静态前端原型",
        current_stage="视觉系统确认",
        current_action="完成五个页面线框",
        reality_boundaries=["只做五个核心页面", "不接后端、真实 AI、登录或数据库"],
        effective_patterns=[{"content": "有明确交付物时更容易启动", "maturity": "candidate"}],
        hypotheses=[{"content": "用户可能通过继续完善文档推迟真实开发", "status": "pending"}],
        recent_revisions=["尚未提交本轮行动反馈"],
        user_corrections=["健身是每周 3 次的维持目标"],
        revision_count=0,
    )
    session.add(snapshot)
    session.flush()
    user.current_snapshot_id = snapshot.id
    session.flush()
    return snapshot
