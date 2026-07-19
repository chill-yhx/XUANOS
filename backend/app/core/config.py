from functools import lru_cache

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="XUANOS_", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./data/xuanos_dev.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    log_level: str = "INFO"
    demo_reset_enabled: bool = False
    session_ttl_days: int = Field(default=30, ge=1, le=90)
    session_cookie_name: str = Field(default="xuanos_session", pattern=r"^[A-Za-z0-9_-]{1,64}$")
    sms_provider: str = "fake"
    fake_sms_outbox_path: str = "data/fake_sms_outbox.jsonl"
    sms_code_hmac_key: SecretStr | None = None
    sms_code_ttl_seconds: int = Field(default=300, ge=60, le=1800)
    sms_send_cooldown_seconds: int = Field(default=60, ge=10, le=600)
    sms_phone_hourly_limit: int = Field(default=5, ge=1, le=100)
    sms_ip_hourly_limit: int = Field(default=30, ge=1, le=1000)
    sms_code_max_attempts: int = Field(default=5, ge=1, le=10)
    password_min_length: int = Field(default=10, ge=8, le=64)
    password_login_window_minutes: int = Field(default=15, ge=1, le=120)
    password_login_phone_limit: int = Field(default=5, ge=1, le=100)
    password_login_ip_limit: int = Field(default=30, ge=1, le=1000)
    decision_engine_provider: str = "deterministic"
    llm_model: str | None = None
    llm_api_key: SecretStr | None = None
    llm_base_url: str | None = None
    llm_timeout_seconds: float = Field(default=8.0, gt=0, le=120)
    llm_shadow_enabled: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_auth_security(self) -> "Settings":
        if self.app_env not in {"development", "test"} and self.sms_provider == "fake":
            raise ValueError("The fake SMS provider is restricted to development and test")
        hmac_key = self.sms_code_hmac_key.get_secret_value() if self.sms_code_hmac_key is not None else ""
        if self.app_env not in {"development", "test"} and len(hmac_key) < 32:
            raise ValueError("XUANOS_SMS_CODE_HMAC_KEY is required outside local development and test")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
