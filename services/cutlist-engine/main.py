"""
Cut List Engine — FastAPI application for OpenLintel.

Generates optimized panel cut lists from furniture specifications, performs
bin-packing nesting onto standard sheet sizes, tracks edge banding requirements,
generates CNC-ready DXF output, and manages reusable offcuts.
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

from src.routers import cutlist
from src.routers import cutlist_job

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler.

    On startup: configure structured logging.
    On shutdown: dispose database engine and close Redis.
    """
    settings = get_settings()
    configure_logging(settings)
    logger.info("cutlist_engine_starting", service="cutlist-engine")
    yield
    await dispose_engine()
    await close_redis()
    logger.info("cutlist_engine_shutdown", service="cutlist-engine")


app = FastAPI(
    title="OpenLintel Cut List Engine",
    description=(
        "Panel cut list generation, bin-packing nesting onto standard sheet sizes, "
        "edge banding calculation, hardware scheduling, CNC-ready DXF output, "
        "and offcut tracking for the OpenLintel interior design platform."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

setup_middleware(app)


# -- Health check --------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    """Liveness probe — returns 200 if the service is running."""
    return HealthResponse(status="ok", service="cutlist-engine")


# -- Include routers -----------------------------------------------------------

app.include_router(cutlist.router)
app.include_router(cutlist_job.router)
