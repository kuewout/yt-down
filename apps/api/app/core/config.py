from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "yt-down API"
    app_env: str = "development"
    database_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/ytdown",
    )
    media_root: str = "./assets"
    log_level: str = "INFO"
    default_cookies_browser: str | None = "round-robin"
    allowed_origins: list[str] = [
        "http://localhost:5001",
    ]

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
