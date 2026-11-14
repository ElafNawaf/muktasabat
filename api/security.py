from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt

from api.config import get_settings

settings = get_settings()

TokenType = Literal["access", "refresh"]


def utcnow() -> datetime:
    """Naive UTC "now" — matches the naive DateTime columns used across models."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_expired(expires: datetime | None) -> bool:
    """True when `expires` is missing or in the past.

    Tolerates both naive (as read back from the DB) and aware datetimes, so a
    value compared in the same request it was written behaves the same as one
    loaded fresh from Postgres/SQLite.
    """
    if expires is None:
        return True
    if expires.tzinfo is not None:
        expires = expires.astimezone(timezone.utc).replace(tzinfo=None)
    return expires < utcnow()


def create_token(
    subject: str | int,
    token_type: TokenType,
    extra_claims: dict | None = None,
    *,
    version: int = 0,
) -> str:
    now = datetime.now(timezone.utc)
    if token_type == "access":
        expires = now + timedelta(minutes=settings.access_token_expire_minutes)
    else:
        expires = now + timedelta(days=settings.refresh_token_expire_days)

    payload: dict = {
        "sub": str(subject),
        "iat": now,
        "exp": expires,
        "type": token_type,
        # Session generation — see User.token_version.
        "ver": int(version or 0),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


def token_matches_user(payload: dict, user) -> bool:
    """A token is only valid for the session generation it was issued in."""
    return int(payload.get("ver", 0) or 0) == int(user.token_version or 0)
