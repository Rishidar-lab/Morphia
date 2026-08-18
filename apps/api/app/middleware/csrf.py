"""CSRF protection middleware.

Validates the `X-CSRF-Token` header against the CSRF token stored on the
user's session for all state-mutating requests (POST, PUT, PATCH, DELETE).

Requests authenticated via API key or worker service auth are exempt,
since those are not browser-cookie-based flows and are not vulnerable to
cross-site request forgery in the same way.
"""

from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.database import async_session_factory
from app.models.auth import Session

STATE_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Paths that are exempt from CSRF checks (e.g. login/register, which create
# the session/CSRF token in the first place, and health checks).
EXEMPT_PATHS = {
    "/api/auth/register",
    "/api/auth/login",
    "/api/health",
    "/api/ready",
}

API_KEY_HEADER = "X-API-Key"
WORKER_AUTH_HEADER = "X-Worker-Auth"


class CSRFMiddleware(BaseHTTPMiddleware):
    """Starlette middleware enforcing double-submit CSRF protection."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method not in STATE_MUTATING_METHODS:
            return await call_next(request)

        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        # API key auth and worker service auth are exempt from CSRF —
        # they are not cookie-based sessions and cannot be forged by a
        # third-party site via the browser.
        if request.headers.get(API_KEY_HEADER):
            return await call_next(request)
        if request.headers.get(WORKER_AUTH_HEADER):
            return await call_next(request)

        session_token = request.cookies.get("sid")
        if not session_token:
            # No cookie session present — likely a Bearer-token API client.
            # Let downstream auth dependencies handle authentication/authorization.
            return await call_next(request)

        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_header:
            return JSONResponse(
                status_code=403,
                content={
                    "code": "CSRF_TOKEN_MISSING",
                    "message": "X-CSRF-Token header is required.",
                },
            )

        async with async_session_factory() as db:
            result = await db.execute(select(Session).where(Session.token == session_token))
            session = result.scalar_one_or_none()

        if not session or session.csrf_token != csrf_header:
            return JSONResponse(
                status_code=403,
                content={"code": "CSRF_TOKEN_INVALID", "message": "Invalid or expired CSRF token."},
            )

        return await call_next(request)
