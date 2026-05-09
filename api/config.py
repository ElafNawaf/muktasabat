import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = os.environ.get("DATABASE_URL", "sqlite:///./muktasbat.db")
    secret_key: str = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8
    refresh_token_expire_days: int = 30

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
