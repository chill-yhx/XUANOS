from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from auth_helpers import cookie_headers, invite_and_login, next_phone
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select, update

from app.core.config import Settings, get_settings
from app.core.errors import APIError
from app.core.phone import MainlandPhoneError, normalize_mainland_phone
from app.db.session import SessionLocal
from app.main import app
from app.models.auth_session import AuthSession
from app.models.auth_verification import AuthRateLimitEvent, SmsVerificationCode
from app.models.user import User
from app.services.sms_provider import get_fake_sms_provider
from app.services.user_admin_service import UserAdminService


def invite(phone: str, display_name: str = "种子用户") -> str:
    with SessionLocal() as session:
        return UserAdminService(session).invite(phone, display_name).id


def send_code(client: TestClient, phone: str, purpose: str = "login") -> str:
    response = client.post("/api/auth/send-code", json={"phone": phone, "purpose": purpose})
    assert response.status_code == 200
    assert response.json()["data"]["accepted"] is True
    code = get_fake_sms_provider().latest_code(normalize_mainland_phone(phone), purpose)
    assert code is not None
    return code


def age_send_limits() -> None:
    with SessionLocal() as session:
        session.execute(
            update(AuthRateLimitEvent)
            .where(AuthRateLimitEvent.action == "send_code")
            .values(created_at=datetime.now(UTC) - timedelta(minutes=2))
        )
        session.commit()


def logout(client: TestClient) -> None:
    response = client.post("/api/auth/logout")
    assert response.status_code == 200


@pytest.mark.parametrize(
    "phone",
    ["13812345678", "+8613812345678", "138 1234 5678"],
)
def test_mainland_phone_is_normalized_to_e164(phone: str) -> None:
    assert normalize_mainland_phone(phone) == "+8613812345678"


@pytest.mark.parametrize(
    "phone",
    ["+85291234567", "+85366123456", "+12025550123", "23812345678", "1381234567", "not-a-phone"],
)
def test_non_mainland_or_invalid_phone_is_rejected(phone: str) -> None:
    with pytest.raises(MainlandPhoneError):
        normalize_mainland_phone(phone)


def test_invitation_saves_unique_e164_phone() -> None:
    phone = "13812345678"
    user_id = invite(phone)
    with SessionLocal() as session:
        user = session.get(User, user_id)
        assert user is not None
        assert user.phone_e164 == "+8613812345678"
        assert user.is_invited is True
        assert user.phone_verified_at is None
        assert user.password_hash is None
        with pytest.raises(APIError):
            UserAdminService(session).invite(phone, "重复邀请")


def test_invited_user_can_verify_phone_and_receives_secure_cookie() -> None:
    phone = next_phone()
    user_id = invite(phone)
    with TestClient(app) as client:
        code = send_code(client, phone)
        response = client.post("/api/auth/verify-code", json={"phone": phone, "code": code})
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["user"]["id"] == user_id
        assert data["user"]["phone_verified"] is True
        assert data["needs_password_setup"] is True
        assert "access_token" not in data
        cookie = response.headers["set-cookie"].lower()
        assert f"{get_settings().session_cookie_name}=" in cookie
        assert "httponly" in cookie
        assert "samesite=lax" in cookie
        assert "path=/" in cookie
        assert "max-age=" in cookie
        assert "secure" not in cookie
        assert client.get("/api/auth/me").status_code == 200

    with SessionLocal() as session:
        user = session.get(User, user_id)
        assert user is not None
        assert user.phone_verified_at is not None
        assert user.last_login_at is not None


def test_production_cookie_is_secure_and_fake_sms_configuration_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            sms_provider="fake",
            sms_code_hmac_key="production-hmac-key-with-at-least-32-characters",
        )

    phone = next_phone()
    invite(phone)
    production_settings = Settings(
        app_env="production",
        sms_provider="disabled",
        sms_code_hmac_key="production-hmac-key-with-at-least-32-characters",
    )
    monkeypatch.setattr("app.api.routes.auth.get_settings", lambda: production_settings)
    with TestClient(app) as client:
        code = send_code(client, phone)
        response = client.post("/api/auth/verify-code", json={"phone": phone, "code": code})
    assert response.status_code == 200
    assert "secure" in response.headers["set-cookie"].lower()


def test_uninvited_phone_gets_generic_send_response_but_cannot_create_session() -> None:
    phone = next_phone()
    with TestClient(app) as client:
        sent = client.post("/api/auth/send-code", json={"phone": phone, "purpose": "login"})
        assert sent.status_code == 200
        assert sent.json()["data"]["message"] == "如果该手机号可用，验证码将很快发送。"
        assert get_fake_sms_provider().latest_code(normalize_mainland_phone(phone), "login") is None
        verified = client.post("/api/auth/verify-code", json={"phone": phone, "code": "123456"})
        assert verified.status_code == 401
        assert verified.json()["error"]["code"] == "CODE_INVALID"
        assert client.get("/api/auth/me").status_code == 401


def test_sms_provider_failure_does_not_reveal_invitation_status(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.sms_provider import SmsProviderError

    class FailingProvider:
        def send_code(self, phone_e164: str, code: str, purpose: str) -> None:
            del phone_e164, code, purpose
            raise SmsProviderError("provider unavailable")

    invited_phone = next_phone()
    unknown_phone = next_phone()
    invite(invited_phone)
    monkeypatch.setattr("app.services.auth_service.get_sms_provider", lambda: FailingProvider())
    with TestClient(app) as client:
        invited = client.post(
            "/api/auth/send-code",
            json={"phone": invited_phone, "purpose": "login"},
        )
        unknown = client.post(
            "/api/auth/send-code",
            json={"phone": unknown_phone, "purpose": "login"},
        )
    assert invited.status_code == unknown.status_code == 200
    assert invited.json()["data"] == unknown.json()["data"]
    with SessionLocal() as session:
        assert session.scalar(select(func.count(SmsVerificationCode.id))) == 0


def test_sms_code_is_hashed_and_never_stored_in_plaintext() -> None:
    phone = next_phone()
    invite(phone)
    with TestClient(app) as client:
        code = send_code(client, phone)

    with SessionLocal() as session:
        challenge = session.scalar(select(SmsVerificationCode))
        assert challenge is not None
        assert challenge.code_hash != code
        assert len(challenge.code_hash) == 64
        assert code not in repr(challenge.__dict__)


def test_sms_cooldown_and_hourly_limit_do_not_create_extra_codes() -> None:
    cooldown_phone = next_phone()
    invite(cooldown_phone)
    with TestClient(app) as client:
        first_code = send_code(client, cooldown_phone)
        cooled = client.post("/api/auth/send-code", json={"phone": cooldown_phone, "purpose": "login"})
        assert cooled.status_code == 200
        assert get_fake_sms_provider().latest_code(normalize_mainland_phone(cooldown_phone), "login") == first_code
        with SessionLocal() as session:
            assert session.scalar(select(func.count(SmsVerificationCode.id))) == 1

        hourly_phone = next_phone()
        invite(hourly_phone)
        for _ in range(get_settings().sms_phone_hourly_limit):
            age_send_limits()
            assert (
                client.post(
                    "/api/auth/send-code",
                    json={"phone": hourly_phone, "purpose": "login"},
                ).status_code
                == 200
            )

        age_send_limits()
        limited = client.post("/api/auth/send-code", json={"phone": hourly_phone, "purpose": "login"})
        assert limited.status_code == 200
        with SessionLocal() as session:
            hourly_codes = session.scalar(
                select(func.count(SmsVerificationCode.id)).where(
                    SmsVerificationCode.phone_e164 == normalize_mainland_phone(hourly_phone)
                )
            )
            assert hourly_codes == get_settings().sms_phone_hourly_limit


def test_new_sms_code_invalidates_the_previous_code(monkeypatch: pytest.MonkeyPatch) -> None:
    phone = next_phone()
    invite(phone)
    generated = iter([123456, 654321])
    monkeypatch.setattr("app.services.auth_service.secrets.randbelow", lambda _limit: next(generated))
    with TestClient(app) as client:
        old_code = send_code(client, phone)
        age_send_limits()
        new_code = send_code(client, phone)
        with SessionLocal() as session:
            challenges = session.scalars(
                select(SmsVerificationCode).order_by(SmsVerificationCode.created_at, SmsVerificationCode.id)
            ).all()
            assert len(challenges) == 2
            assert sum(item.invalidated_at is not None for item in challenges) == 1
            assert sum(item.invalidated_at is None for item in challenges) == 1
        assert client.post("/api/auth/verify-code", json={"phone": phone, "code": old_code}).status_code == 401
        assert client.post("/api/auth/verify-code", json={"phone": phone, "code": new_code}).status_code == 200


def test_sms_code_expires_cannot_be_reused_and_stops_after_five_attempts() -> None:
    expired_phone = next_phone()
    invite(expired_phone)
    with TestClient(app) as client:
        expired_code = send_code(client, expired_phone)
        with SessionLocal() as session:
            challenge = session.scalar(
                select(SmsVerificationCode).where(
                    SmsVerificationCode.phone_e164 == normalize_mainland_phone(expired_phone)
                )
            )
            assert challenge is not None
            challenge.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            session.commit()
        assert (
            client.post("/api/auth/verify-code", json={"phone": expired_phone, "code": expired_code}).status_code == 401
        )

    reuse_phone = next_phone()
    invite(reuse_phone)
    with TestClient(app) as client:
        code = send_code(client, reuse_phone)
        assert client.post("/api/auth/verify-code", json={"phone": reuse_phone, "code": code}).status_code == 200
        logout(client)
        assert client.post("/api/auth/verify-code", json={"phone": reuse_phone, "code": code}).status_code == 401

    attempts_phone = next_phone()
    invite(attempts_phone)
    with TestClient(app) as client:
        correct_code = send_code(client, attempts_phone)
        wrong_code = "000000" if correct_code != "000000" else "111111"
        for _ in range(5):
            response = client.post(
                "/api/auth/verify-code",
                json={"phone": attempts_phone, "code": wrong_code},
            )
            assert response.status_code == 401
        assert (
            client.post(
                "/api/auth/verify-code",
                json={"phone": attempts_phone, "code": correct_code},
            ).status_code
            == 401
        )


def test_setting_argon2id_password_enables_password_login_without_leaking_account_state() -> None:
    phone = next_phone()
    with TestClient(app) as client:
        user_id, _headers = invite_and_login(client, phone=phone)
        response = client.post("/api/auth/set-password", json={"new_password": "correct horse battery staple"})
        assert response.status_code == 200
        assert response.json()["data"]["user"]["has_password"] is True
        assert "password_hash" not in response.text
        logout(client)

        success = client.post(
            "/api/auth/login-password",
            json={"phone": phone, "password": "correct horse battery staple"},
        )
        assert success.status_code == 200
        assert success.json()["data"]["user"]["id"] == user_id
        logout(client)

        wrong = client.post(
            "/api/auth/login-password",
            json={"phone": phone, "password": "wrong password value"},
        )
        unset_phone = next_phone()
        invite(unset_phone)
        unset = client.post(
            "/api/auth/login-password",
            json={"phone": unset_phone, "password": "wrong password value"},
        )
        missing = client.post(
            "/api/auth/login-password",
            json={"phone": next_phone(), "password": "wrong password value"},
        )
        assert {wrong.status_code, unset.status_code, missing.status_code} == {401}
        messages = {
            wrong.json()["error"]["message"],
            unset.json()["error"]["message"],
            missing.json()["error"]["message"],
        }
        assert messages == {"手机号或密码不正确，请尝试验证码登录。"}

    with SessionLocal() as session:
        user = session.get(User, user_id)
        assert user is not None and user.password_hash is not None
        assert user.password_hash.startswith("$argon2id$")
        assert "correct horse battery staple" not in user.password_hash


def test_password_login_is_rate_limited_after_repeated_failures() -> None:
    phone = next_phone()
    password = "rate limited password value"
    with TestClient(app) as client:
        invite_and_login(client, phone=phone)
        assert client.post("/api/auth/set-password", json={"new_password": password}).status_code == 200
        logout(client)
        for _ in range(get_settings().password_login_phone_limit):
            response = client.post(
                "/api/auth/login-password",
                json={"phone": phone, "password": "incorrect password value"},
            )
            assert response.status_code == 401
        limited = client.post(
            "/api/auth/login-password",
            json={"phone": phone, "password": password},
        )
        assert limited.status_code == 429
        assert limited.json()["error"]["code"] == "LOGIN_RATE_LIMITED"


def test_change_password_revokes_other_sessions_and_invalidates_old_password() -> None:
    phone = next_phone()
    password = "initial password for xuanos"
    new_password = "updated password for xuanos"
    with TestClient(app) as primary:
        invite_and_login(primary, phone=phone)
        assert primary.post("/api/auth/set-password", json={"new_password": password}).status_code == 200

        with TestClient(app) as secondary:
            assert (
                secondary.post("/api/auth/login-password", json={"phone": phone, "password": password}).status_code
                == 200
            )
            changed = primary.post(
                "/api/auth/change-password",
                json={"current_password": password, "new_password": new_password},
            )
            assert changed.status_code == 200
            assert primary.get("/api/auth/me").status_code == 200
            assert secondary.get("/api/auth/me").status_code == 401

        logout(primary)
        assert primary.post("/api/auth/login-password", json={"phone": phone, "password": password}).status_code == 401
        assert (
            primary.post("/api/auth/login-password", json={"phone": phone, "password": new_password}).status_code == 200
        )


def test_reset_password_requires_reset_code_and_revokes_all_sessions() -> None:
    phone = next_phone()
    password = "initial reset password"
    new_password = "new reset password value"
    with TestClient(app) as primary:
        invite_and_login(primary, phone=phone)
        assert primary.post("/api/auth/set-password", json={"new_password": password}).status_code == 200
        primary_cookie = cookie_headers(primary)

        with TestClient(app) as secondary:
            assert (
                secondary.post("/api/auth/login-password", json={"phone": phone, "password": password}).status_code
                == 200
            )
            secondary_cookie = cookie_headers(secondary)

        age_send_limits()
        reset_code = send_code(primary, phone, "reset_password")
        reset = primary.post(
            "/api/auth/reset-password",
            json={"phone": phone, "code": reset_code, "new_password": new_password},
        )
        assert reset.status_code == 200

        with TestClient(app, headers=primary_cookie) as old_primary:
            assert old_primary.get("/api/auth/me").status_code == 401
        with TestClient(app, headers=secondary_cookie) as old_secondary:
            assert old_secondary.get("/api/auth/me").status_code == 401
        assert primary.post("/api/auth/login-password", json={"phone": phone, "password": password}).status_code == 401
        assert (
            primary.post("/api/auth/login-password", json={"phone": phone, "password": new_password}).status_code == 200
        )


def test_code_purpose_cannot_be_reused_for_password_reset() -> None:
    phone = next_phone()
    with TestClient(app) as client:
        invite_and_login(client, phone=phone)
        set_password = client.post(
            "/api/auth/set-password",
            json={"new_password": "existing password value"},
        )
        assert set_password.status_code == 200
        age_send_limits()
        login_code = send_code(client, phone, "login")
        failed = client.post(
            "/api/auth/reset-password",
            json={"phone": phone, "code": login_code, "new_password": "replacement password value"},
        )
        assert failed.status_code == 400
        assert failed.json()["error"]["code"] == "RESET_FAILED"


def test_disabled_user_sessions_and_both_login_methods_are_rejected() -> None:
    phone = next_phone()
    password = "disabled user password"
    with TestClient(app) as client:
        invite_and_login(client, phone=phone)
        assert client.post("/api/auth/set-password", json={"new_password": password}).status_code == 200
        with SessionLocal() as session:
            UserAdminService(session).disable(phone)

        assert client.get("/api/auth/me").status_code == 401
        assert client.post("/api/auth/login-password", json={"phone": phone, "password": password}).status_code == 401
        age_send_limits()
        sent = client.post("/api/auth/send-code", json={"phone": phone, "purpose": "login"})
        assert sent.status_code == 200
        with SessionLocal() as session:
            active_codes = session.scalar(
                select(func.count(SmsVerificationCode.id)).where(
                    SmsVerificationCode.phone_e164 == normalize_mainland_phone(phone),
                    SmsVerificationCode.consumed_at.is_(None),
                    SmsVerificationCode.invalidated_at.is_(None),
                )
            )
            assert active_codes == 0


def test_sms_and_password_sessions_use_the_same_server_session_type() -> None:
    phone = next_phone()
    with TestClient(app) as client:
        user_id, _headers = invite_and_login(client, phone=phone)
        set_password = client.post(
            "/api/auth/set-password",
            json={"new_password": "same session type password"},
        )
        assert set_password.status_code == 200
        logout(client)
        assert (
            client.post(
                "/api/auth/login-password",
                json={"phone": phone, "password": "same session type password"},
            ).status_code
            == 200
        )

    with SessionLocal() as session:
        sessions = session.scalars(select(AuthSession).where(AuthSession.user_id == user_id)).all()
        assert len(sessions) == 2
        assert all(item.token_hash and len(item.token_hash) == 64 for item in sessions)


def test_auth_responses_and_logs_do_not_contain_plain_secrets(caplog: pytest.LogCaptureFixture) -> None:
    phone = next_phone()
    password = f"secret-password-{uuid4().hex}"
    with TestClient(app) as client:
        invite(phone)
        code = send_code(client, phone)
        verified = client.post("/api/auth/verify-code", json={"phone": phone, "code": code})
        set_result = client.post("/api/auth/set-password", json={"new_password": password})
        bodies = verified.text + set_result.text
        assert code not in bodies
        assert password not in bodies
        assert "password_hash" not in bodies
        assert "access_token" not in bodies
        assert code not in caplog.text
        assert password not in caplog.text

        oversized_password = f"validation-secret-{uuid4().hex}" * 10
        invalid = client.post(
            "/api/auth/login-password",
            json={"phone": phone, "password": oversized_password},
        )
        assert invalid.status_code == 422
        assert oversized_password not in invalid.text
        assert "input" not in invalid.json()["error"]["details"][0]


def test_admin_list_masks_phone_and_disable_revokes_sessions(capsys: pytest.CaptureFixture[str]) -> None:
    from app.cli.users import main

    phone = "13812345678"
    assert main(["invite", "--phone", phone, "--display-name", "测试用户1"]) == 0
    capsys.readouterr()
    assert main(["list"]) == 0
    listing = capsys.readouterr().out
    assert "138****5678" in listing
    assert phone not in listing

    with TestClient(app) as client:
        code = send_code(client, phone)
        assert client.post("/api/auth/verify-code", json={"phone": phone, "code": code}).status_code == 200
        assert main(["disable", "--phone", phone]) == 0
        capsys.readouterr()
        assert client.get("/api/auth/me").status_code == 401
        assert main(["enable", "--phone", phone]) == 0
        capsys.readouterr()
        assert main(["reset-data", "--phone", phone]) == 0
