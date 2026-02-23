"""
MEP Calculator — FastAPI application for OpenLintel.

Provides Mechanical (HVAC), Electrical, and Plumbing calculations
based on industry standards (NEC, IPC, ASHRAE Manual J).
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

from src.routers import electrical, hvac, mep_job, plumbing

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler."""
    settings = get_settings()
    configure_logging(settings)
    logger.info("mep_calculator_starting", service="mep-calculator")
    yield
    await dispose_engine()
    await close_redis()
    logger.info("mep_calculator_shutdown", service="mep-calculator")


app = FastAPI(
    title="OpenLintel MEP Calculator",
    description=(
        "Mechanical, Electrical, and Plumbing calculations for interior design "
        "projects.  All calculations cite their source standard (NEC, IPC, ASHRAE)."
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
    return HealthResponse(status="ok", service="mep-calculator")


# -- Include routers -----------------------------------------------------------

app.include_router(electrical.router)
app.include_router(plumbing.router)
app.include_router(hvac.router)
app.include_router(mep_job.router)
