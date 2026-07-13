import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.seed import create_user_with_snapshot
from app.models.auth_session import AuthSession
from app.schemas.auth import AuthSessionCreateResult


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AuthService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_session(self) -> AuthSessionCreateResult:
        user_id = f"user_{uuid4().hex}"
        create_user_with_snapshot(self.session, user_id)

        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(days=get_settings().session_ttl_days)
        self.session.add(
            AuthSession(
                user_id=user_id,
                token_hash=token_hash(raw_token),
                expires_at=expires_at,
            )
        )
        self.session.commit()
        return AuthSessionCreateResult(
            access_token=raw_token,
            user_id=user_id,
            expires_at=expires_at,
        )
