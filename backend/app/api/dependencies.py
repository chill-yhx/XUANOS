from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, status
from fastapi.security import APIKeyCookie
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import APIError
from app.db.session import get_db
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.auth_service import token_hash

session_cookie = APIKeyCookie(name=get_settings().session_cookie_name, auto_error=False)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def get_current_auth_session(
    raw_token: Annotated[str | None, Depends(session_cookie)],
    session: Annotated[Session, Depends(get_db)],
) -> AuthSession:
    if not raw_token:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "需要有效的 XUANOS 会话。")

    auth_session = session.scalar(select(AuthSession).where(AuthSession.token_hash == token_hash(raw_token)))
    if auth_session is None or auth_session.revoked_at is not None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID", "XUANOS 会话无效。")
    if _as_utc(auth_session.expires_at) <= datetime.now(UTC):
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_EXPIRED", "XUANOS 会话已过期。")
    return auth_session


def get_current_user(
    auth_session: Annotated[AuthSession, Depends(get_current_auth_session)],
    session: Annotated[Session, Depends(get_db)],
) -> User:
    user = session.get(User, auth_session.user_id)
    if user is None or not user.is_invited or user.status != "active" or user.phone_verified_at is None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID", "XUANOS 会话无效。")
    return user


CurrentAuthSession = Annotated[AuthSession, Depends(get_current_auth_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
