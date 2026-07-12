from sqlalchemy.orm import Session

from app.models.snapshot import UserSnapshot
from app.models.user import User

DEMO_USER_ID = "demo-user"


def ensure_demo_user(session: Session) -> tuple[User, UserSnapshot]:
    user = session.get(User, DEMO_USER_ID)
    if user is None:
        user = User(
            id=DEMO_USER_ID,
            display_name="演示用户",
            timezone="Asia/Shanghai",
            consent_version="v0.1",
        )
        session.add(user)
        session.flush()

    snapshot = session.get(UserSnapshot, user.current_snapshot_id) if user.current_snapshot_id else None
    if snapshot is None:
        snapshot = UserSnapshot(
            user_id=DEMO_USER_ID,
            version=1,
            current_vector="完成 XUANOS 静态前端原型",
            current_stage="视觉系统确认",
            current_action="完成五个页面线框",
            reality_boundaries=["只做五个核心页面", "不接后端、真实 AI、登录或数据库"],
            effective_patterns=[{"content": "有明确交付物时更容易启动", "maturity": "candidate"}],
            hypotheses=[
                {
                    "content": "用户可能通过继续完善文档推迟真实开发",
                    "status": "pending",
                }
            ],
            recent_revisions=["尚未提交本轮行动反馈"],
            user_corrections=["健身是每周 3 次的维持目标"],
            revision_count=0,
        )
        session.add(snapshot)
        session.flush()
        user.current_snapshot_id = snapshot.id
        session.flush()

    return user, snapshot
