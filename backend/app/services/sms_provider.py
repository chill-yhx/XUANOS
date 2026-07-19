import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Protocol

from app.core.config import get_settings


class SmsProviderError(RuntimeError):
    pass


class SmsProvider(Protocol):
    def send_code(self, phone_e164: str, code: str, purpose: str) -> None: ...


@dataclass(frozen=True)
class FakeSmsMessage:
    phone_e164: str
    code: str
    purpose: str
    sent_at: datetime


class FakeSmsProvider:
    def __init__(self) -> None:
        self._messages: list[FakeSmsMessage] = []
        self._lock = Lock()

    def send_code(self, phone_e164: str, code: str, purpose: str) -> None:
        settings = get_settings()
        if settings.app_env not in {"development", "test"}:
            raise SmsProviderError("Fake SMS is restricted to development and test environments")
        message = FakeSmsMessage(phone_e164, code, purpose, datetime.now(UTC))
        with self._lock:
            self._messages.append(message)
            if settings.app_env == "development":
                outbox_path = Path(settings.fake_sms_outbox_path)
                outbox_path.parent.mkdir(parents=True, exist_ok=True)
                with outbox_path.open("a", encoding="utf-8") as outbox:
                    outbox.write(
                        json.dumps(
                            {
                                "phone_e164": message.phone_e164,
                                "code": message.code,
                                "purpose": message.purpose,
                                "sent_at": message.sent_at.isoformat(),
                            },
                            ensure_ascii=False,
                        )
                        + "\n"
                    )

    def latest_code(self, phone_e164: str, purpose: str) -> str | None:
        with self._lock:
            for message in reversed(self._messages):
                if message.phone_e164 == phone_e164 and message.purpose == purpose:
                    return message.code
        return None

    def clear(self) -> None:
        with self._lock:
            self._messages.clear()


class UnavailableSmsProvider:
    def send_code(self, phone_e164: str, code: str, purpose: str) -> None:
        del phone_e164, code, purpose
        raise SmsProviderError("SMS provider is not configured")


_fake_provider = FakeSmsProvider()


def get_sms_provider() -> SmsProvider:
    provider = get_settings().sms_provider
    if provider == "fake":
        return _fake_provider
    if provider == "disabled":
        return UnavailableSmsProvider()
    raise SmsProviderError(f"Unsupported SMS provider: {provider}")


def get_fake_sms_provider() -> FakeSmsProvider:
    return _fake_provider
