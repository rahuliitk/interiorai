"""
Async SQLAlchemy engine and session factory.

Usage in a FastAPI service::

    from openlintel_shared.db import get_db_session
    from sqlalchemy.ext.asyncio import AsyncSession

    @router.get("/projects")
    async def list_projects(db: AsyncSession = Depends(get_db_session)):
        result = await db.execute(select(Project))
        ...
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Annotated

import structlog
from fastapi import Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from openlintel_shared.config import Settings, get_settings

logger = structlog.get_logger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _get_engine(settings: Settings | None = None) -> AsyncEngine:
    """Create or return the cached async engine."""
    global _engine  # noqa: PLW0603
    if _engine is not None:
        return _engine

    if settings is None:
        settings = get_settings()

    _engine = create_async_engine(
        settings.async_database_url,
        echo=settings.LOG_LEVEL == "debug",
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=300,
    )
    return _engine


def _get_session_factory(settings: Settings | None = None) -> async_sessionmaker[AsyncSession]:
    """Create or return the cached session factory."""
    global _session_factory  # noqa: PLW0603
    if _session_factory is not None:
        return _session_factory

    engine = _get_engine(settings)
    _session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    return _session_factory


async def get_db_session(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a transactional async database session.

    The session is committed on success and rolled back on exception.  It is
    always closed when the request finishes.
    """
    factory = _get_session_factory(settings)
    session = factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


def get_session_factory(settings: Settings | None = None) -> async_sessionmaker[AsyncSession]:
    """Public accessor for the cached async session factory.

    Use this to create sessions **outside** the FastAPI request lifecycle,
    e.g. in ``BackgroundTasks`` workers::

        factory = get_session_factory()
        async with factory() as db:
            await db.execute(...)
            await db.commit()
    """
    return _get_session_factory(settings)


async def check_db_health(settings: Settings | None = None) -> bool:
    """Execute a lightweight ``SELECT 1`` to verify database connectivity.

    Returns
    -------
    bool
        ``True`` if the database responded, ``False`` otherwise.
    """
    engine = _get_engine(settings)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("database_health_check_failed")
        return False


async def dispose_engine() -> None:
    """Gracefully dispose of the engine and reset module-level state.

    Call this in your FastAPI ``shutdown`` lifespan event.
    """
    global _engine, _session_factory  # noqa: PLW0603
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
