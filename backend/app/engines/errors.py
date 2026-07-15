class DecisionEngineError(RuntimeError):
    """Base error for an unavailable or invalid decision engine."""


class UnsupportedDecisionEngineError(DecisionEngineError):
    """Raised when the configured decision-engine provider is unknown."""
