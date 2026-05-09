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

    # When true, forgot-password response may include debug_reset_url (dev only).
    reset_password_debug: bool = False

    # --- Email (AWS SES on prod; console fallback in dev) ---
    # Set ses_region + ses_from_email to enable real email via SES.
    # Leave ses_region empty to print emails to stdout (default for local dev).
    ses_region: str = os.environ.get("SES_REGION", "")
    ses_from_email: str = os.environ.get("SES_FROM_EMAIL", "")
    ses_configuration_set: str = os.environ.get("SES_CONFIGURATION_SET", "")
    # Public URL of the web app, used to build links in email bodies.
    web_base_url: str = os.environ.get("WEB_BASE_URL", "http://localhost:3000")

    # --- Amazon Translate ---
    # Falls back to ses_region when not set (same AWS account, save IAM hop).
    # Empty → /translate endpoint returns the original text (no-op).
    translate_region: str = os.environ.get("TRANSLATE_REGION", "")

    # --- S3 (image uploads) ---
    # When s3_bucket is empty, image upload endpoints return 503; useful in dev
    # if you don't want to provision a bucket yet.
    s3_bucket: str = os.environ.get("S3_BUCKET", "")
    s3_region: str = os.environ.get("S3_REGION", "")
    s3_endpoint_url: str = os.environ.get("S3_ENDPOINT_URL", "")  # for MinIO / R2
    # Public-facing base URL for uploaded objects. Defaults to S3 path-style URL.
    # Override when using CloudFront in front of the bucket.
    s3_public_base_url: str = os.environ.get("S3_PUBLIC_BASE_URL", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
