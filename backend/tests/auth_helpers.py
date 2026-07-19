from itertools import count

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.phone import normalize_mainland_phone
from app.db.session import SessionLocal
from app.services.sms_provider import get_fake_sms_provider
from app.services.user_admin_service import UserAdminService

_phone_sequence = count(1)


def next_phone() -> str:
    return f"138{next(_phone_sequence):08d}"


def cookie_headers(client: TestClient) -> dict[str, str]:
    cookie_name = get_settings().session_cookie_name
    token = client.cookies.get(cookie_name)
    assert token is not None
    return {"Cookie": f"{cookie_name}={token}"}


def invite_and_login(
    client: TestClient,
    *,
    phone: str | None = None,
    display_name: str = "测试用户",
) -> tuple[str, dict[str, str]]:
    raw_phone = phone or next_phone()
    with SessionLocal() as session:
        invited = UserAdminService(session).invite(raw_phone, display_name)

    sent = client.post("/api/auth/send-code", json={"phone": raw_phone, "purpose": "login"})
    assert sent.status_code == 200
    code = get_fake_sms_provider().latest_code(normalize_mainland_phone(raw_phone), "login")
    assert code is not None
    verified = client.post("/api/auth/verify-code", json={"phone": raw_phone, "code": code})
    assert verified.status_code == 200
    assert "access_token" not in verified.json()["data"]
    return invited.id, cookie_headers(client)
