"""Database engine and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


settings = get_settings()

_engine_options: dict[str, object] = {
    "echo": settings.debug,
    "pool_pre_ping": True,
}
if settings.database_url.startswith("sqlite"):
    # SQLite's in-process test database uses a StaticPool and does not accept
    # PostgreSQL's pool sizing arguments.
    from sqlalchemy.pool import StaticPool

    _engine_options["poolclass"] = StaticPool
else:
    _engine_options.update(pool_size=10, max_overflow=20)

engine = create_async_engine(settings.database_url, **_engine_options)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides a database session per request.

    Note: the session's commit happens in the *route*, not in this
    dependency's cleanup — FastAPI runs `yield`-dependencies' cleanup
    AFTER the response is sent, so committing here would race against
    the client's follow-up request. Routes that write must call
    `await db.commit()` themselves before returning, then the cleanup
    block below is a safety net (idempotent if no writes were made).
    """
    async with async_session_factory() as session:
        try:
            yield session
            if session.in_transaction():
                await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
