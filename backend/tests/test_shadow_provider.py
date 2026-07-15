import json
from typing import Any

import httpx
import pytest

from app.engines.errors import (
    ShadowProviderPaymentRequiredError,
    ShadowProviderResponseError,
    ShadowProviderTimeoutError,
    ShadowProviderTransportError,
)
from app.engines.provider import OpenAICompatibleShadowProvider
from app.prompts.types import PromptSpec


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self.payload = payload

    def json(self) -> dict[str, Any]:
        return self.payload


class RecordingClient:
    response: FakeResponse = FakeResponse(200, {"choices": [{"message": {"content": '{"ok":true}'}}]})
    raised_error: Exception | None = None
    calls: list[dict[str, Any]] = []
    timeout: float | None = None

    def __init__(self, *, timeout: float) -> None:
        type(self).timeout = timeout

    def __enter__(self) -> "RecordingClient":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]) -> FakeResponse:
        type(self).calls.append({"url": url, "headers": headers, "json": json})
        if self.raised_error is not None:
            raise self.raised_error
        return self.response


@pytest.fixture(autouse=True)
def reset_recording_client() -> None:
    RecordingClient.response = FakeResponse(200, {"choices": [{"message": {"content": '{"ok":true}'}}]})
    RecordingClient.raised_error = None
    RecordingClient.calls = []
    RecordingClient.timeout = None


def provider() -> OpenAICompatibleShadowProvider:
    return OpenAICompatibleShadowProvider(
        base_url="https://llm.example/v1/",
        api_key="local-test-secret",
        model_name="test-model",
        timeout_seconds=15,
    )


def prompt() -> PromptSpec:
    return PromptSpec(version="test_v1", messages=[{"role": "user", "content": "return json"}])


def test_openai_compatible_provider_uses_custom_endpoint_model_timeout_and_json_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.engines.provider.httpx.Client", RecordingClient)

    result = provider().generate(prompt())

    assert json.loads(result) == {"ok": True}
    assert RecordingClient.timeout == 15
    assert RecordingClient.calls == [
        {
            "url": "https://llm.example/v1/chat/completions",
            "headers": {
                "Authorization": "Bearer local-test-secret",
                "Content-Type": "application/json",
            },
            "json": {
                "model": "test-model",
                "messages": [{"role": "user", "content": "return json"}],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
        }
    ]


def test_openai_compatible_provider_standardizes_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    request = httpx.Request("POST", "https://llm.example/v1/chat/completions")
    RecordingClient.raised_error = httpx.ReadTimeout("secret-free timeout", request=request)
    monkeypatch.setattr("app.engines.provider.httpx.Client", RecordingClient)

    with pytest.raises(ShadowProviderTimeoutError, match="Shadow provider timed out"):
        provider().generate(prompt())


def test_openai_compatible_provider_standardizes_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    RecordingClient.response = FakeResponse(500, {"error": {"message": "upstream details must not leak"}})
    monkeypatch.setattr("app.engines.provider.httpx.Client", RecordingClient)

    with pytest.raises(ShadowProviderTransportError, match="Shadow provider returned an HTTP error") as error:
        provider().generate(prompt())

    assert "upstream details" not in str(error.value)
    assert "local-test-secret" not in str(error.value)


def test_openai_compatible_provider_marks_payment_required_without_upstream_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    RecordingClient.response = FakeResponse(402, {"error": {"message": "private account detail"}})
    monkeypatch.setattr("app.engines.provider.httpx.Client", RecordingClient)

    with pytest.raises(ShadowProviderPaymentRequiredError, match="requires account credit") as error:
        provider().generate(prompt())

    assert "private account detail" not in str(error.value)
    assert "local-test-secret" not in str(error.value)


def test_openai_compatible_provider_rejects_unsupported_response_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    RecordingClient.response = FakeResponse(200, {"choices": []})
    monkeypatch.setattr("app.engines.provider.httpx.Client", RecordingClient)

    with pytest.raises(ShadowProviderResponseError, match="unsupported response"):
        provider().generate(prompt())


def test_openai_compatible_provider_marks_empty_content_without_reading_reasoning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_reasoning = "private-reasoning-must-not-be-read-or-logged"
    RecordingClient.response = FakeResponse(
        200,
        {"choices": [{"message": {"content": "", "reasoning_content": private_reasoning}}]},
    )
    monkeypatch.setattr("app.engines.provider.httpx.Client", RecordingClient)

    with pytest.raises(ShadowProviderResponseError, match="did not contain JSON text") as error:
        provider().generate(prompt())

    assert private_reasoning not in str(error.value)
