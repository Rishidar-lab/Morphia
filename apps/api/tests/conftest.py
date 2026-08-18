"""Shared API test configuration.

The application requires explicit secrets and database settings in every
runtime. Tests provide safe, disposable defaults before importing the app so
that ``pytest`` works from a clean clone without a developer-owned ``.env`` or
external services.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator

import pytest

# Set defaults before any test module imports app.main/app.core.database.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-not-for-production")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL_SYNC", "sqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("WORKER_AUTH_SECRET", "test-only-worker-secret")
os.environ.setdefault("ALLOWED_ORIGINS", "http://test")

from app.core.database import Base, engine
from app.models import (  # noqa: F401 — import models before create_all
    ApprovalRequest,
    Asset,
    AuditEvent,
    Engagement,
    EvidenceArtifact,
    EvidenceRelation,
    Finding,
    FindingVerification,
    Project,
    Report,
    ReportFinding,
    Run,
    RunEvent,
    RunStep,
    ScopeRule,
    Session,
    User,
)


async def _create_schema() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def _drop_schema() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="session", autouse=True)
def database_schema() -> Iterator[None]:
    """Create and remove a disposable schema for the API test session."""

    asyncio.run(_create_schema())
    try:
        yield
    finally:
        asyncio.run(_drop_schema())
