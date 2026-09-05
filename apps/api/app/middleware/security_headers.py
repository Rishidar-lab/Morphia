"""Production-oriented HTTP security headers.

Applied to every API response. The strict Content-Security-Policy and HSTS
are production-only (the interactive API docs need inline scripts, and HSTS
must never be emitted over plain-HTTP dev hosts); the baseline headers are
always sent.
"""

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

BASELINE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
}

PRODUCTION_CSP = (
    "default-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "form-action 'self'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: object, is_production: bool = False) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self.is_production = is_production

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        for name, value in BASELINE_HEADERS.items():
            response.headers.setdefault(name, value)
        if self.is_production:
            response.headers.setdefault("Content-Security-Policy", PRODUCTION_CSP)
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response
