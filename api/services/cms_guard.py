"""Abuse protection for the public website forms.

- `client_ip()`      — real visitor IP. Next.js forwards X-Forwarded-For
                       (see web/src/lib/forward.ts); Caddy sets it in front.
- `rate_limit()`     — fixed-window, in-process limiter. Production runs a
                       single API container, so in-memory is sufficient; move
                       to Redis if the API is ever scaled horizontally.
- `verify_turnstile()` — Cloudflare Turnstile check, enabled only when
                       TURNSTILE_SECRET_KEY is set (no-op otherwise).
- `ip_hash()`        — salted hash so we can spot abuse without storing raw
                       IPs (PDPL data-minimisation).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import urllib.parse
import urllib.request
from collections import defaultdict

from fastapi import HTTPException, Request, status

from api.config import get_settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_hits: dict[str, list[float]] = defaultdict(list)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def ip_hash(ip: str) -> str:
    salt = get_settings().secret_key
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:32]


def rate_limit(request: Request, bucket: str, *, limit: int, window_s: int) -> None:
    key = f"{bucket}:{client_ip(request)}"
    now = time.monotonic()
    with _lock:
        hits = [t for t in _hits[key] if now - t < window_s]
        if len(hits) >= limit:
            _hits[key] = hits
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests — please try again later.",
            )
        hits.append(now)
        _hits[key] = hits
        # Opportunistic cleanup so the dict can't grow without bound.
        if len(_hits) > 5000:
            for k in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
                _hits.pop(k, None)


def verify_turnstile(token: str | None, ip: str) -> None:
    secret = os.environ.get("TURNSTILE_SECRET_KEY", "")
    if not secret:
        return
    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification required")
    data = urllib.parse.urlencode({"secret": secret, "response": token, "remoteip": ip}).encode()
    try:
        req = urllib.request.Request(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify", data=data
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            ok = bool(json.loads(resp.read()).get("success"))
    except Exception:
        logger.exception("Turnstile verification call failed")
        ok = False
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification failed")
