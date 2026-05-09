"""Per-request structured logger.

Every HTTP request gets:
  - a 12-char request_id (echoed back as `X-Request-ID` so users can quote it
    when reporting bugs)
  - one JSON log line on completion with method/path/status/duration_ms +
    the authenticated user_id when a JWT was supplied
  - one ERROR log with full traceback if the handler raised
"""
from __future__ import annotations

import logging
import time
import uuid

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from api.security import decode_token

logger = logging.getLogger("muktasabat.request")


def _user_from_authorization(header: str | None) -> int | None:
    if not header or not header.lower().startswith("bearer "):
        return None
    token = header.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        return int(sub) if sub is not None else None
    except (jwt.InvalidTokenError, ValueError, KeyError):
        return None


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = uuid.uuid4().hex[:12]
        request.state.request_id = request_id

        start = time.perf_counter()
        user_id = _user_from_authorization(request.headers.get("authorization"))
        client_ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")
        # X-Forwarded-For is what Caddy sets when proxying — prefer that for client_ip.
        xff = request.headers.get("x-forwarded-for")
        if xff:
            client_ip = xff.split(",")[0].strip()

        common_fields = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query) or None,
            "user_id": user_id,
            "client_ip": client_ip,
            "ua": ua,
        }

        try:
            response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.error(
                "request_failed",
                extra={**common_fields, "status": 500, "duration_ms": duration_ms,
                       "error_type": type(exc).__name__, "error": str(exc)},
                exc_info=True,
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        status = response.status_code
        # 5xx → WARNING level so it stands out in `docker logs | grep WARNING`.
        # Health checks at INFO would flood logs; keep at INFO but you can filter
        # on path=="/api/health" in CloudWatch Insights.
        level = logging.WARNING if status >= 500 else logging.INFO
        logger.log(
            level,
            "request",
            extra={**common_fields, "status": status, "duration_ms": duration_ms},
        )

        response.headers["X-Request-ID"] = request_id
        return response
