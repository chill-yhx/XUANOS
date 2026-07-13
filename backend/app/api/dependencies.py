from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import APIError
from app.db.session import get_db
from app.models.auth_session import AuthSession
from app.models.user import User
from app.services.auth_service import token_hash

bearer_scheme = HTTPBearer(auto_error=False)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    session: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_REQUIRED", "需要有效的 XUANOS 会话。")

    auth_session = session.scalar(
        select(AuthSession).where(AuthSession.token_hash == token_hash(credentials.credentials))
    )
    if auth_session is None or auth_session.revoked_at is not None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID", "XUANOS 会话无效。")
    if _as_utc(auth_session.expires_at) <= datetime.now(UTC):
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_EXPIRED", "XUANOS 会话已过期。")

    user = session.get(User, auth_session.user_id)
    if user is None:
        raise APIError(status.HTTP_401_UNAUTHORIZED, "AUTH_INVALID", "XUANOS 会话无效。")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
