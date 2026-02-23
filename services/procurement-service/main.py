"""
Procurement Service — Purchase order generation, vendor selection, delivery
tracking, and order phasing for OpenLintel.

Generates vendor-optimised purchase orders from BOM data, phases orders to
align with the construction schedule, tracks deliveries, and alerts on delays.
Uses LangGraph agents for intelligent vendor selection and OR-Tools for
multi-vendor cost optimisation.
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

from src.routers import delivery, orders

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
        "procurement_service_startup",
        service="procurement-service",
        log_level=settings.LOG_LEVEL,
    )

    yield  # -- App is running --

    # Shutdown
    logger.info("procurement_service_shutdown")
    await dispose_engine()
    await close_redis()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OpenLintel Procurement Service",
    description=(
        "Purchase order generation from BOM, vendor selection with OR-Tools "
        "optimisation, delivery tracking with delay alerts, and JIT order "
        "phasing aligned to the construction schedule."
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
    return HealthResponse(status="ok", service="procurement-service")


# -- Include routers -------------------------------------------------------

app.include_router(orders.router)
app.include_router(delivery.router)
