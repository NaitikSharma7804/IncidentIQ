"""Typed application settings using pydantic-settings."""
import os
import secrets

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "incidentiq.db")).replace("\\", "/")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    incidentiq_env: str = Field(default="development", alias="INCIDENTIQ_ENV")
    incidentiq_jwt_secret: str = Field(default="", alias="INCIDENTIQ_JWT_SECRET")
    incidentiq_jwt_ttl_minutes: int = Field(default=60, alias="INCIDENTIQ_JWT_TTL_MINUTES")
    incidentiq_database_url: str = Field(default=f"sqlite:///{_DEFAULT_DB_PATH}", alias="INCIDENTIQ_DATABASE_URL")
    incidentiq_cors_origins: str = Field(default="http://localhost:5173", alias="INCIDENTIQ_CORS_ORIGINS")
    incidentiq_demo_password: str = Field(default="demo-only", alias="INCIDENTIQ_DEMO_PASSWORD")
    incidentiq_enable_llm: bool = Field(default=False, alias="INCIDENTIQ_ENABLE_LLM")
    incidentiq_llm_api_key: str | None = Field(default=None, alias="INCIDENTIQ_LLM_API_KEY")
    incidentiq_llm_base_url: str | None = Field(default=None, alias="INCIDENTIQ_LLM_BASE_URL")
    incidentiq_llm_model: str = Field(default="gpt-4o-mini", alias="INCIDENTIQ_LLM_MODEL")
    incidentiq_redis_url: str | None = Field(default=None, alias="INCIDENTIQ_REDIS_URL")
    incidentiq_rate_limit: str = Field(default="120/minute", alias="INCIDENTIQ_RATE_LIMIT")
    incidentiq_login_rate_limit: str = Field(default="100/minute", alias="INCIDENTIQ_LOGIN_RATE_LIMIT")
    debug: bool = Field(default=False, alias="DEBUG")

    @field_validator("incidentiq_cors_origins")
    @classmethod
    def validate_cors(cls, v: str) -> str:
        origins = [o.strip() for o in v.split(",") if o.strip()]
        if "*" in origins:
            raise ValueError("Wildcard '*' CORS origin is forbidden when credentials are supported")
        return v

    def get_cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.incidentiq_cors_origins.split(",") if o.strip() and o.strip() != "*"]

    def validate_production_secret(self) -> None:
        if self.incidentiq_env == "production":
            if not self.incidentiq_jwt_secret or len(self.incidentiq_jwt_secret) < 32 or self.incidentiq_jwt_secret.startswith("change"):
                raise RuntimeError("INCIDENTIQ_JWT_SECRET must be set (>=32 chars) in production")

    def get_jwt_secret(self) -> str:
        self.validate_production_secret()
        if not self.incidentiq_jwt_secret:
            return _DEV_FALLBACK_SECRET
        return self.incidentiq_jwt_secret


_DEV_FALLBACK_SECRET = secrets.token_urlsafe(32)


def get_settings() -> Settings:
    settings = Settings()
    settings.validate_production_secret()
    return settings
