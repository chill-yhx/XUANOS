import hashlib
import hmac
import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import APIError
from app.core.passwords import hash_password, password_needs_rehash, verify_password
from app.core.phone import MainlandPhoneError, mask_mainland_phone, normalize_mainland_phone
from app.db.base import new_id
from app.models.auth_session import AuthSession
from app.models.auth_verification import AuthRateLimitEvent, SmsVerificationCode
from app.models.user import User
from app.schemas.auth import AuthOperationResult, AuthSessionResult, AuthUserResult, SendCodeResult
from app.services.sms_provider import SmsProviderError, get_sms_provider

_development_hmac_key = secrets.token_bytes(32)
_dummy_password_hash = hash_password(secrets.token_urlsafe(32))
logger = logging.getLogger(__name__)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _hmac_key() -> bytes:
    configured = get_settings().sms_code_hmac_key
    if configured is not None and configured.get_secret_value():
        return configured.get_secret_value().encode("utf-8")
    if get_settings().app_env in {"development", "test"}:
        return _development_hmac_key
    raise RuntimeError("SMS HMAC key is not configured")


def _subject_hash(phone_e164: str) -> str:
    return hmac.new(_hmac_key(), phone_e164.encode("utf-8"), hashlib.sha256).hexdigest()


def _code_hash(challenge_id: str, phone_e164: str, purpose: str, code: str) -> str:
    payload = f"{challenge_id}:{phone_e164}:{purpose}:{code}".encode()
    return hmac.new(_hmac_key(), payload, hashlib.sha256).hexdigest()


def _normalize_phone(value: str) -> str:
    try:
        return normalize_mainland_phone(value)
    except MainlandPhoneError as exc:
        raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "INVALID_PHONE", str(exc)) from exc


def _validate_password(password: str) -> None:
    settings = get_settings()
    if len(password) < settings.password_min_length:
        raise APIError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "WEAK_PASSWORD",
            f"密码至少需要 {settings.password_min_length} 个字符。",
        )
    if len(password) > 256:
        raise APIError(status.HTTP_422_UNPROCESSABLE_ENTITY, "WEAK_PASSWORD", "密码长度不能超过 256 个字符。")


def _auth_user(user: User) -> AuthUserResult:
    return AuthUserResult(
        id=user.id,
        phone_masked=mask_mainland_phone(user.phone_e164 or ""),
        display_name=user.display_name,
        status=user.status,
        phone_verified=user.phone_verified_at is not None,
        has_password=user.password_hash is not None,
    )


@dataclass(frozen=True)
class IssuedSession:
    result: AuthSessionResult
    raw_token: str
    session_id: str


class AuthService:
    def __init__(self, session: Session, request_ip: str) -> None:
        self.session = session
        self.request_ip = request_ip[:64] or "unknown"

    def send_code(self, phone: str, purpose: str) -> SendCodeResult:
        phone_e164 = _normalize_phone(phone)
        settings = get_settings()
        now = datetime.now(UTC)
        subject_hash = _subject_hash(phone_e164)

        is_limited = self._send_is_limited(subject_hash, now)
        self.session.add(
            AuthRateLimitEvent(
                subject_hash=subject_hash,
                ip_address=self.request_ip,
                action="send_code",
                succeeded=None,
            )
        )
        if is_limited:
            self.session.commit()
            return self._generic_send_result()

        user = self.session.scalar(select(User).where(User.phone_e164 == phone_e164))
        eligible = user is not None and user.is_invited and user.status == "active"
        if purpose == "reset_password":
            eligible = eligible and user is not None and user.phone_verified_at is not None

        if eligible and user is not None:
            self.session.execute(
                update(SmsVerificationCode)
                .where(
                    SmsVerificationCode.phone_e164 == phone_e164,
                    SmsVerificationCode.consumed_at.is_(None),
                    SmsVerificationCode.invalidated_at.is_(None),
                )
                .values(invalidated_at=now)
            )
            challenge_id = new_id()
            code = f"{secrets.randbelow(1_000_000):06d}"
            challenge = SmsVerificationCode(
                id=challenge_id,
                user_id=user.id,
                phone_e164=phone_e164,
                purpose=purpose,
                code_hash=_code_hash(challenge_id, phone_e164, purpose, code),
                request_ip=self.request_ip,
                max_attempts=settings.sms_code_max_attempts,
                expires_at=now + timedelta(seconds=settings.sms_code_ttl_seconds),
            )
            self.session.add(challenge)
            self.session.flush()
            try:
                get_sms_provider().send_code(phone_e164, code, purpose)
            except SmsProviderError:
                self.session.rollback()
                self.session.add(
                    AuthRateLimitEvent(
                        subject_hash=subject_hash,
                        ip_address=self.request_ip,
                        action="send_code",
                        succeeded=None,
                    )
                )
                self.session.commit()
                logger.warning("SMS provider unavailable while processing a generic send request")
                return self._generic_send_result()

        self.session.commit()
        return self._generic_send_result()

    def verify_login_code(self, phone: str, code: str) -> IssuedSession:
        phone_e164 = _normalize_phone(phone)
        user = self.session.scalar(select(User).where(User.phone_e164 == phone_e164))
        if user is None or not user.is_invited or user.status != "active":
            raise self._invalid_code_error()

        challenge = self._valid_challenge(phone_e164, "login")
        if challenge is None or not self._consume_challenge(challenge, code):
            self.session.commit()
            raise self._invalid_code_error()

        now = datetime.now(UTC)
        if user.phone_verified_at is None:
            user.phone_verified_at = now
        user.last_login_at = now
        issued = self._issue_session(user)
        self.session.commit()
        return issued

    def login_password(self, phone: str, password: str) -> IssuedSession:
        phone_e164 = _normalize_phone(phone)
        now = datetime.now(UTC)
        subject_hash = _subject_hash(phone_e164)
        if self._password_login_is_limited(subject_hash, now):
            self._record_login_attempt(subject_hash, False)
            self.session.commit()
            raise APIError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "LOGIN_RATE_LIMITED",
                "手机号或密码不正确，请稍后重试或使用验证码登录。",
            )

        user = self.session.scalar(select(User).where(User.phone_e164 == phone_e164))
        password_hash = user.password_hash if user is not None and user.password_hash else _dummy_password_hash
        password_matches = verify_password(password_hash, password)
        eligible = (
            user is not None
            and user.is_invited
            and user.status == "active"
            and user.phone_verified_at is not None
            and user.password_hash is not None
        )
        if not eligible or not password_matches or user is None:
            self._record_login_attempt(subject_hash, False)
            self.session.commit()
            raise APIError(
                status.HTTP_401_UNAUTHORIZED,
                "LOGIN_FAILED",
                "手机号或密码不正确，请尝试验证码登录。",
            )

        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
        user.last_login_at = now
        self._record_login_attempt(subject_hash, True)
        issued = self._issue_session(user)
        self.session.commit()
        return issued

    def set_password(self, user: User, auth_session: AuthSession, new_password: str) -> AuthSessionResult:
        if user.password_hash is not None:
            raise APIError(status.HTTP_409_CONFLICT, "PASSWORD_ALREADY_SET", "请使用修改密码功能。")
        _validate_password(new_password)
        now = datetime.now(UTC)
        user.password_hash = hash_password(new_password)
        user.password_updated_at = now
        self._revoke_other_sessions(user.id, auth_session.id, now)
        self.session.commit()
        return self._session_result(user, auth_session.expires_at)

    def change_password(
        self,
        user: User,
        auth_session: AuthSession,
        current_password: str,
        new_password: str,
    ) -> AuthSessionResult:
        if user.password_hash is None or not verify_password(user.password_hash, current_password):
            raise APIError(status.HTTP_401_UNAUTHORIZED, "PASSWORD_CHANGE_FAILED", "当前密码不正确。")
        _validate_password(new_password)
        now = datetime.now(UTC)
        user.password_hash = hash_password(new_password)
        user.password_updated_at = now
        self._revoke_other_sessions(user.id, auth_session.id, now)
        self.session.commit()
        return self._session_result(user, auth_session.expires_at)

    def reset_password(self, phone: str, code: str, new_password: str) -> AuthOperationResult:
        phone_e164 = _normalize_phone(phone)
        _validate_password(new_password)
        user = self.session.scalar(select(User).where(User.phone_e164 == phone_e164))
        challenge = self._valid_challenge(phone_e164, "reset_password") if user is not None else None
        if (
            user is None
            or not user.is_invited
            or user.status != "active"
            or user.phone_verified_at is None
            or challenge is None
            or not self._consume_challenge(challenge, code)
        ):
            self.session.commit()
            raise APIError(status.HTTP_400_BAD_REQUEST, "RESET_FAILED", "验证码无效或已过期。")

        now = datetime.now(UTC)
        user.password_hash = hash_password(new_password)
        user.password_updated_at = now
        self.session.execute(
            update(AuthSession)
            .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self.session.commit()
        return AuthOperationResult(message="密码已重置，请重新登录。")

    def logout(self, auth_session: AuthSession) -> AuthOperationResult:
        if auth_session.revoked_at is None:
            auth_session.revoked_at = datetime.now(UTC)
            self.session.commit()
        return AuthOperationResult(message="已退出登录。")

    def current_session_result(self, user: User, auth_session: AuthSession) -> AuthSessionResult:
        return self._session_result(user, auth_session.expires_at)

    def _send_is_limited(self, subject_hash: str, now: datetime) -> bool:
        settings = get_settings()
        cooldown_since = now - timedelta(seconds=settings.sms_send_cooldown_seconds)
        hour_since = now - timedelta(hours=1)
        cooldown_count = self.session.scalar(
            select(func.count(AuthRateLimitEvent.id)).where(
                AuthRateLimitEvent.action == "send_code",
                AuthRateLimitEvent.subject_hash == subject_hash,
                AuthRateLimitEvent.created_at >= cooldown_since,
            )
        )
        phone_count = self.session.scalar(
            select(func.count(AuthRateLimitEvent.id)).where(
                AuthRateLimitEvent.action == "send_code",
                AuthRateLimitEvent.subject_hash == subject_hash,
                AuthRateLimitEvent.created_at >= hour_since,
            )
        )
        ip_count = self.session.scalar(
            select(func.count(AuthRateLimitEvent.id)).where(
                AuthRateLimitEvent.action == "send_code",
                AuthRateLimitEvent.ip_address == self.request_ip,
                AuthRateLimitEvent.created_at >= hour_since,
            )
        )
        return bool(
            cooldown_count
            or (phone_count or 0) >= settings.sms_phone_hourly_limit
            or (ip_count or 0) >= settings.sms_ip_hourly_limit
        )

    def _password_login_is_limited(self, subject_hash: str, now: datetime) -> bool:
        settings = get_settings()
        since = now - timedelta(minutes=settings.password_login_window_minutes)
        phone_failures = self.session.scalar(
            select(func.count(AuthRateLimitEvent.id)).where(
                AuthRateLimitEvent.action == "password_login",
                AuthRateLimitEvent.subject_hash == subject_hash,
                AuthRateLimitEvent.succeeded.is_(False),
                AuthRateLimitEvent.created_at >= since,
            )
        )
        ip_failures = self.session.scalar(
            select(func.count(AuthRateLimitEvent.id)).where(
                AuthRateLimitEvent.action == "password_login",
                AuthRateLimitEvent.ip_address == self.request_ip,
                AuthRateLimitEvent.succeeded.is_(False),
                AuthRateLimitEvent.created_at >= since,
            )
        )
        return bool(
            (phone_failures or 0) >= settings.password_login_phone_limit
            or (ip_failures or 0) >= settings.password_login_ip_limit
        )

    def _record_login_attempt(self, subject_hash: str, succeeded: bool) -> None:
        self.session.add(
            AuthRateLimitEvent(
                subject_hash=subject_hash,
                ip_address=self.request_ip,
                action="password_login",
                succeeded=succeeded,
            )
        )

    def _valid_challenge(self, phone_e164: str, purpose: str) -> SmsVerificationCode | None:
        now = datetime.now(UTC)
        challenge = self.session.scalar(
            select(SmsVerificationCode)
            .where(
                SmsVerificationCode.phone_e164 == phone_e164,
                SmsVerificationCode.purpose == purpose,
                SmsVerificationCode.consumed_at.is_(None),
                SmsVerificationCode.invalidated_at.is_(None),
            )
            .order_by(SmsVerificationCode.created_at.desc(), SmsVerificationCode.id.desc())
        )
        if challenge is None:
            return None
        if _as_utc(challenge.expires_at) <= now or challenge.attempts >= challenge.max_attempts:
            challenge.invalidated_at = now
            return None
        return challenge

    def _consume_challenge(self, challenge: SmsVerificationCode, code: str) -> bool:
        expected = _code_hash(challenge.id, challenge.phone_e164, challenge.purpose, code)
        if not hmac.compare_digest(challenge.code_hash, expected):
            challenge.attempts += 1
            if challenge.attempts >= challenge.max_attempts:
                challenge.invalidated_at = datetime.now(UTC)
            return False
        challenge.consumed_at = datetime.now(UTC)
        return True

    def _issue_session(self, user: User) -> IssuedSession:
        settings = get_settings()
        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(days=settings.session_ttl_days)
        auth_session = AuthSession(user_id=user.id, token_hash=token_hash(raw_token), expires_at=expires_at)
        self.session.add(auth_session)
        self.session.flush()
        return IssuedSession(
            result=self._session_result(user, expires_at),
            raw_token=raw_token,
            session_id=auth_session.id,
        )

    def _session_result(self, user: User, expires_at: datetime) -> AuthSessionResult:
        return AuthSessionResult(
            user=_auth_user(user),
            expires_at=expires_at,
            needs_password_setup=user.password_hash is None,
        )

    def _revoke_other_sessions(self, user_id: str, current_session_id: str, now: datetime) -> None:
        self.session.execute(
            update(AuthSession)
            .where(
                AuthSession.user_id == user_id,
                AuthSession.id != current_session_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    @staticmethod
    def _generic_send_result() -> SendCodeResult:
        return SendCodeResult(
            retry_after_seconds=get_settings().sms_send_cooldown_seconds,
            message="如果该手机号可用，验证码将很快发送。",
        )

    @staticmethod
    def _invalid_code_error() -> APIError:
        return APIError(status.HTTP_401_UNAUTHORIZED, "CODE_INVALID", "验证码无效或已过期。")
