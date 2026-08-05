"""MORPHIA API — FastAPI application entry point."""

import structlog
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import get_settings
from app.routers import health, auth, projects


logger = structlog.get_logger()
settings = get_settings()

# ── Rate Limiter ──────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: startup and shutdown."""
    # ── Startup ───────────────────────────────────────────
    log = logger.bind(environment=settings.environment)

    if settings.is_production and settings.enable_e2e_auth_override:
        log.critical(
            "SECURITY: ENABLE_E2E_AUTH_OVERRIDE is set in production. "
            "This variable is IGNORED in production. Remove it from your environment."
        )

    log.info(
        "morphia.startup",
        host=settings.api_host,
        port=settings.api_port,
        storage_backend=settings.storage_backend,
        debug=settings.debug,
    )
    yield
    # ── Shutdown ──────────────────────────────────────────
    log.info("morphia.shutdown")


# ── Application ──────────────────────────────────────────
app = FastAPI(
    title="MORPHIA",
    description="Cybersecurity research orchestration platform",
    version="0.1.0",
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url="/api/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

app.state.limiter = limiter


# ── Middleware ────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)


# ── Error Handlers ───────────────────────────────────────
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "code": "RATE_LIMITED",
            "message": "Too many requests. Please try again later.",
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(
        "unhandled_exception",
        request_id=request_id,
        path=str(request.url.path),
        method=request.method,
        error=str(exc),
        exc_info=not settings.is_production,
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred.",
            "requestId": request_id,
        },
    )


# ── Request ID Middleware ────────────────────────────────
@app.middleware("http")
async def add_request_id(request: Request, call_next: Any) -> Any:
    import uuid
    request_id = str(uuid.uuid4())[:12]
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# ── Routes ───────────────────────────────────────────────
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
