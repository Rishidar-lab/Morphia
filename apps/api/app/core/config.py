"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """MORPHIA API configuration. All secrets come from environment only."""

    # Application
    environment: str = Field(default="development", alias="ENVIRONMENT")
    debug: bool = Field(default=False, alias="DEBUG")
    secret_key: str = Field(..., alias="SECRET_KEY")
    api_host: str = Field(default="0.0.0.0", alias="API_HOST")
    api_port: int = Field(default=8000, alias="API_PORT")
    frontend_url: str = Field(default="http://localhost:5173", alias="FRONTEND_URL")
    allowed_origins: str = Field(
        default="http://localhost:5173", alias="ALLOWED_ORIGINS"
    )

    # Database
    database_url: str = Field(..., alias="DATABASE_URL")
    database_url_sync: str = Field(default="", alias="DATABASE_URL_SYNC")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")

    # Auth
    session_lifetime_hours: int = Field(default=24, alias="SESSION_LIFETIME_HOURS")
    auth_rate_limit: str = Field(default="10/minute", alias="AUTH_RATE_LIMIT")
    worker_auth_rate_limit: str = Field(
        default="60/minute", alias="WORKER_AUTH_RATE_LIMIT"
    )

    # Storage
    storage_backend: str = Field(default="local", alias="STORAGE_BACKEND")
    storage_local_path: str = Field(default="./storage", alias="STORAGE_LOCAL_PATH")
    s3_endpoint_url: str = Field(default="", alias="S3_ENDPOINT_URL")
    s3_bucket_name: str = Field(default="", alias="S3_BUCKET_NAME")
    s3_access_key_id: str = Field(default="", alias="S3_ACCESS_KEY_ID")
    s3_secret_access_key: str = Field(default="", alias="S3_SECRET_ACCESS_KEY")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")

    # Worker
    worker_auth_secret: str = Field(default="", alias="WORKER_AUTH_SECRET")

    # Testing — NEVER set in production
    enable_e2e_auth_override: bool = Field(
        default=False, alias="ENABLE_E2E_AUTH_OVERRIDE"
    )
    test_owner_email: str = Field(default="", alias="TEST_OWNER_EMAIL")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_test(self) -> bool:
        return self.environment == "test"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


def get_settings() -> Settings:
    """Create settings instance. Validates all required fields on startup."""
    return Settings()  # type: ignore[call-arg]
