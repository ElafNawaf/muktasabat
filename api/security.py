from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt

from api.config import get_settings

settings = get_settings()

TokenType = Literal["access", "refresh"]


def create_token(subject: str | int, token_type: TokenType, extra_claims: dict | None = None) -> str:
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
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
