"""
Project Service — Construction scheduling, milestones, site logs, and change
order impact analysis for OpenLintel.

Generates Gantt-ready construction schedules from BOM and design data,
manages milestones and daily site logs, and analyses the cost/time impact
of change orders using LangGraph agents and OR-Tools critical path analysis.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from pydantic import BaseModel

from openlintel_shared.config import get_settings
from openlintel_shared.db import dispose_engine
from openlintel_shared.middleware import configure_logging, setup_middleware
from openlintel_shared.redis_client import close_redis

from src.routers import change_orders, milestones, schedules, schedule_job, site_logs

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler.

    Startup:
        - Configure structured logging.

    Shutdown:
        - Dispose of the async DB engine.
        - Close the Redis connection pool.
    """
    settings = get_settings()
    configure_logging(settings)

    logger.info(
        "project_service_startup",
        service="project-service",
        log_level=settings.LOG_LEVEL,
    )

    yield  # -- App is running --

    # Shutdown
    logger.info("project_service_shutdown")
    await dispose_engine()
    await close_redis()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OpenLintel Project Service",
    description=(
        "Construction scheduling, Gantt chart generation, milestone management, "
        "site logs, and change order impact analysis.  Uses LangGraph agents for "
        "intelligent schedule generation and OR-Tools for critical path computation."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


# -- Middleware -------------------------------------------------------------
setup_middleware(app)


# -- Health check -----------------------------------------------------------


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    """Liveness probe -- returns 200 if the service is running."""
    return HealthResponse(status="ok", service="project-service")


# -- Include routers -------------------------------------------------------

app.include_router(schedules.router)
app.include_router(schedule_job.router)
app.include_router(milestones.router)
app.include_router(site_logs.router)
app.include_router(change_orders.router)
