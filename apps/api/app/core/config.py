from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "yt-down API"
    app_env: str = "development"
    database_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/ytdown",
    )
    media_root: str = "./assets"
    log_level: str = "INFO"
    default_cookies_browser: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
