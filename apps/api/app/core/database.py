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
    """Dependency that provides a database session per request."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
