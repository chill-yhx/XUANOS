from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.core.phone import MainlandPhoneError, mask_mainland_phone, normalize_mainland_phone
from app.db.seed import create_user_with_snapshot
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.demo_service import DemoService


@dataclass(frozen=True)
class AdminUserView:
    id: str
    phone_masked: str
    display_name: str | None
    status: str
    phone_verified: bool
    has_password: bool


class UserAdminService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def invite(self, phone: str, display_name: str) -> AdminUserView:
        phone_e164 = self._normalize(phone)
        normalized_display_name = display_name.strip()
        if not normalized_display_name:
            raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "INVALID_DISPLAY_NAME", "显示名称不能为空。")
        existing = self.session.scalar(select(User).where(User.phone_e164 == phone_e164))
        if existing is not None:
            raise APIError(status.HTTP_409_CONFLICT, "PHONE_ALREADY_INVITED", "该手机号已存在邀请记录。")

        user, _snapshot = create_user_with_snapshot(
            self.session,
            f"user_{uuid4().hex}",
            phone_e164=phone_e164,
            display_name=normalized_display_name,
            is_invited=True,
            status="active",
        )
        self.session.commit()
        return self._view(user)

    def list_users(self) -> list[AdminUserView]:
        users = self.session.scalars(
            select(User).where(User.is_invited.is_(True)).order_by(User.created_at.asc())
        ).all()
        return [self._view(user) for user in users]

    def disable(self, phone: str) -> AdminUserView:
        user = self._find_invited(phone)
        now = datetime.now(UTC)
        user.status = "disabled"
        self.session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self.session.commit()
        return self._view(user)

    def enable(self, phone: str) -> AdminUserView:
        user = self._find_invited(phone)
        user.status = "active"
        self.session.commit()
        return self._view(user)

    def reset_data(self, phone: str) -> AdminUserView:
        user = self._find_invited(phone)
        DemoService(self.session, user.id).reset()
        return self._view(user)

    def _find_invited(self, phone: str) -> User:
        phone_e164 = self._normalize(phone)
        user = self.session.scalar(select(User).where(User.phone_e164 == phone_e164, User.is_invited.is_(True)))
        if user is None:
            raise APIError(status.HTTP_404_NOT_FOUND, "USER_NOT_FOUND", "未找到受邀用户。")
        return user

    @staticmethod
    def _normalize(phone: str) -> str:
        try:
            return normalize_mainland_phone(phone)
        except MainlandPhoneError as exc:
            raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "INVALID_PHONE", str(exc)) from exc

    @staticmethod
    def _view(user: User) -> AdminUserView:
        return AdminUserView(
            id=user.id,
            phone_masked=mask_mainland_phone(user.phone_e164 or ""),
            display_name=user.display_name,
            status=user.status,
            phone_verified=user.phone_verified_at is not None,
            has_password=user.password_hash is not None,
        )
