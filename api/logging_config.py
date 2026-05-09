"""Configure stdlib logging to emit one JSON object per line.

CloudWatch Logs / docker logs / journalctl all parse one-line JSON nicely; you can
search with `docker logs muktasabat-api-1 | jq 'select(.status >= 500)'` or use
CloudWatch Logs Insights' parse expression.

Anything passed via `logger.info(..., extra={...})` is merged into the JSON
output so the request-logging middleware can attach request_id / duration / etc.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone

# Standard LogRecord attributes — anything else in record.__dict__ came from
# `extra=` and should appear in the JSON.
_RESERVED = {
    "args", "asctime", "created", "exc_info", "exc_text", "filename",
    "funcName", "levelname", "levelno", "lineno", "message", "module",
    "msecs", "msg", "name", "pathname", "process", "processName",
    "relativeCreated", "stack_info", "thread", "threadName", "taskName",
}


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in _RESERVED or key.startswith("_"):
                continue
            payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def setup_logging(level: str | None = None) -> None:
    """Wire JSON formatter onto the root logger and quiet uvicorn's default access logs."""
    log_level = (level or os.environ.get("LOG_LEVEL") or "INFO").upper()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(log_level)

    # uvicorn.access duplicates what our middleware already writes (and isn't JSON).
    access = logging.getLogger("uvicorn.access")
    access.handlers = []
    access.propagate = False

    # Keep uvicorn.error at INFO so startup / shutdown still show up.
    logging.getLogger("uvicorn").handlers = [handler]
    logging.getLogger("uvicorn").propagate = False
    logging.getLogger("uvicorn.error").handlers = [handler]
    logging.getLogger("uvicorn.error").propagate = False
