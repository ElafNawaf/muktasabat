"""Request / mutation logging for tracing (correlate with browser console modal logs)."""
import uuid

from flask import g, request


def register_request_logging(app):
    """Attach a short request id and log state-changing requests."""

    @app.before_request
    def _assign_request_id():
        g.request_id = uuid.uuid4().hex[:12]
        if request.path.startswith('/static/'):
            return
        # DEBUG: every non-static hit (optional noise; tune via LOG_LEVEL)
        app.logger.debug(
            '[req %s] %s %s endpoint=%s',
            g.request_id,
            request.method,
            request.path,
            request.endpoint,
        )

    @app.after_request
    def _log_mutations(response):
        if request.path.startswith('/static/'):
            return response
        rid = getattr(g, 'request_id', '?')
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            app.logger.info(
                '[req %s] %s %s endpoint=%s status=%s',
                rid,
                request.method,
                request.path,
                request.endpoint,
                response.status_code,
            )
        return response
