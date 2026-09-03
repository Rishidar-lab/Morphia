"""System status — safe, non-secret operational visibility.

Backs the Settings / System Status page. NEVER emits secrets: provider keys,
session secrets, database credentials, and full environment values are not
returned by any field here.
"""

import os
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import APP_VERSION, get_settings
from app.core.database import get_db
from app.models.auth import User
from app.routers.auth import get_current_user

router = APIRouter()


class HealthCheck(BaseModel):
    status: str  # "ok" | "degraded" | "unknown"
    detail: str = ""


class SystemStatus(BaseModel):
    version: str
    environment: str
    debug: bool
    provider: str
    storage_backend: str
    session_lifetime_hours: int
    database: HealthCheck
    redis: HealthCheck
    worker: HealthCheck
    migration: HealthCheck
    checked_at: datetime


def _configured_provider() -> str:
    explicit = (os.getenv("MORPHIA_PROVIDER") or "").strip().lower()
    if explicit:
        return explicit
    for key, name in (
        ("OPENAI_API_KEY", "openai"),
        ("OPENROUTER_API_KEY", "openrouter"),
        ("LOCAL_MODEL_URL", "local"),
    ):
        if os.getenv(key):
            return f"{name} (auto)"
    return "mock (default)"


@router.get("/status", response_model=SystemStatus)
async def system_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SystemStatus:
    """Operational status with no secret material. Any signed-in user may read."""
    settings = get_settings()

    try:
        await db.execute(text("SELECT 1"))
        database = HealthCheck(status="ok", detail="reachable")
    except Exception as e:
        database = HealthCheck(status="degraded", detail=type(e).__name__)

    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        keys = [k async for k in r.scan_iter("worker:heartbeat:*")]
        await r.aclose()
        redis = HealthCheck(status="ok", detail="reachable")
        if keys:
            worker = HealthCheck(status="ok", detail=f"{len(keys)} worker(s) reporting")
        else:
            worker = HealthCheck(status="unknown", detail="no worker heartbeat observed")
    except Exception as e:
        redis = HealthCheck(status="degraded", detail=type(e).__name__)
        worker = HealthCheck(status="unknown", detail="redis unreachable")

    try:
        revision = (await db.execute(text("SELECT version_num FROM alembic_version"))).scalar()
        migration = HealthCheck(
            status="ok" if revision else "degraded", detail=str(revision or "no revision")
        )
    except Exception as e:
        migration = HealthCheck(status="degraded", detail=type(e).__name__)

    return SystemStatus(
        version=APP_VERSION,
        environment=settings.environment,
        debug=settings.debug,
        provider=_configured_provider(),
        storage_backend=settings.storage_backend,
        session_lifetime_hours=settings.session_lifetime_hours,
        database=database,
        redis=redis,
        worker=worker,
        migration=migration,
        checked_at=datetime.now(UTC),
    )
