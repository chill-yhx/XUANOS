from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import get_settings
from app.engines.action_engine import ActionEngine, DeterministicActionEngine
from app.engines.errors import (
    ShadowProviderResponseError,
    ShadowProviderTimeoutError,
    ShadowProviderTransportError,
    ShadowProviderUnavailableError,
    UnsupportedDecisionEngineError,
)
from app.engines.plan_engine import DeterministicPlanEngine, PlanEngine
from app.engines.understanding_engine import DeterministicUnderstandingEngine, UnderstandingEngine
from app.prompts.types import PromptSpec


@dataclass(frozen=True)
class DecisionEngines:
    understanding: UnderstandingEngine
    plan: PlanEngine
    action: ActionEngine


class ShadowLLMProvider(Protocol):
    provider_name: str
    model_name: str

    def generate(self, prompt: PromptSpec) -> str: ...


@dataclass(frozen=True)
class OpenAICompatibleShadowProvider:
    base_url: str
    api_key: str
    model_name: str
    timeout_seconds: float
    provider_name: str = "openai_compatible"

    def generate(self, prompt: PromptSpec) -> str:
        endpoint = self._endpoint()
        payload = {
            "model": self.model_name,
            "messages": prompt.messages,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.TimeoutException as error:
            raise ShadowProviderTimeoutError("Shadow provider timed out") from error
        except httpx.HTTPError as error:
            raise ShadowProviderTransportError("Shadow provider transport failed") from error

        if response.status_code >= 400:
            raise ShadowProviderTransportError("Shadow provider returned an HTTP error")
        try:
            body = response.json()
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise ShadowProviderResponseError("Shadow provider returned an unsupported response") from error
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            text = "".join(
                str(part.get("text", "")) for part in content if isinstance(part, dict) and part.get("type") == "text"
            )
            if text:
                return text
        raise ShadowProviderResponseError("Shadow provider response did not contain JSON text")

    def _endpoint(self) -> str:
        base_url = self.base_url.rstrip("/")
        return base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"


def get_decision_engines() -> DecisionEngines:
    """Return the formal deterministic baseline.

    `decision_engine_provider` also names the optional shadow transport. It
    never changes the formal provider in this stage: all user-visible workflow
    results remain deterministic until an explicit future promotion.
    """

    provider = get_settings().decision_engine_provider.strip().casefold()
    if provider not in {"deterministic", "openai", "openai_compatible"}:
        raise UnsupportedDecisionEngineError(f"Unsupported decision engine provider: {provider}")
    return DecisionEngines(
        understanding=DeterministicUnderstandingEngine(),
        plan=DeterministicPlanEngine(),
        action=DeterministicActionEngine(),
    )


def get_shadow_provider() -> ShadowLLMProvider:
    """Build the optional LLM transport without exposing credentials in errors."""

    settings = get_settings()
    provider = settings.decision_engine_provider.strip().casefold()
    if provider not in {"openai", "openai_compatible"}:
        raise ShadowProviderUnavailableError("No shadow LLM provider is configured")
    if not settings.llm_model or not settings.llm_base_url or settings.llm_api_key is None:
        raise ShadowProviderUnavailableError("Shadow LLM configuration is incomplete")
    api_key = settings.llm_api_key.get_secret_value()
    if not api_key:
        raise ShadowProviderUnavailableError("Shadow LLM configuration is incomplete")
    return OpenAICompatibleShadowProvider(
        base_url=settings.llm_base_url,
        api_key=api_key,
        model_name=settings.llm_model,
        timeout_seconds=settings.llm_timeout_seconds,
        provider_name="openai_compatible" if provider == "openai_compatible" else "openai",
    )
