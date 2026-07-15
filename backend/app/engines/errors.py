class DecisionEngineError(RuntimeError):
    """Base error for an unavailable or invalid decision engine."""


class UnsupportedDecisionEngineError(DecisionEngineError):
    """Raised when the configured decision-engine provider is unknown."""


class ShadowProviderError(DecisionEngineError):
    """A sanitized error that may be stored in a shadow evaluation record."""

    code = "PROVIDER_ERROR"


class ShadowProviderUnavailableError(ShadowProviderError):
    code = "PROVIDER_UNAVAILABLE"


class ShadowProviderTimeoutError(ShadowProviderError):
    code = "PROVIDER_TIMEOUT"


class ShadowProviderResponseError(ShadowProviderError):
    code = "PROVIDER_INVALID_RESPONSE"


class ShadowProviderTransportError(ShadowProviderError):
    code = "PROVIDER_TRANSPORT_ERROR"
