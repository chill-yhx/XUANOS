from dataclasses import dataclass

from app.core.config import get_settings
from app.engines.action_engine import ActionEngine, DeterministicActionEngine
from app.engines.errors import UnsupportedDecisionEngineError
from app.engines.plan_engine import DeterministicPlanEngine, PlanEngine
from app.engines.understanding_engine import DeterministicUnderstandingEngine, UnderstandingEngine


@dataclass(frozen=True)
class DecisionEngines:
    understanding: UnderstandingEngine
    plan: PlanEngine
    action: ActionEngine


def get_decision_engines() -> DecisionEngines:
    """Return the configured business-decision provider.

    The deterministic provider is production-safe because every decision is
    derived from the active thread's submitted context. A future model-backed
    provider can implement the same contracts without changing routes or
    persistence services.
    """

    provider = get_settings().decision_engine_provider.strip().casefold()
    if provider != "deterministic":
        raise UnsupportedDecisionEngineError(f"Unsupported decision engine provider: {provider}")
    return DecisionEngines(
        understanding=DeterministicUnderstandingEngine(),
        plan=DeterministicPlanEngine(),
        action=DeterministicActionEngine(),
    )
