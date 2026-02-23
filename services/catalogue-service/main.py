"""
Catalogue Service — FastAPI application for OpenLintel.

Manages the product catalogue with full-text search via Meilisearch,
visual similarity search via pgvector, vendor management, and price
comparison across vendors.
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

from src.routers import categories, products, vendors
from src.services.search import ensure_meilisearch_index

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler.

    On startup: configure logging and initialize Meilisearch index.
    On shutdown: dispose database engine and close Redis.
    """
    settings = get_settings()
    configure_logging(settings)
    logger.info("catalogue_service_starting", service="catalogue-service")

    # Initialize Meilisearch index
    await ensure_meilisearch_index()

    yield
    await dispose_engine()
    await close_redis()
    logger.info("catalogue_service_shutdown", service="catalogue-service")


app = FastAPI(
    title="OpenLintel Catalogue Service",
    description=(
        "Product catalogue management with full-text search via Meilisearch, "
        "visual similarity search via pgvector, vendor management, and price "
        "comparison for the OpenLintel interior design platform."
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
    return HealthResponse(status="ok", service="catalogue-service")


# -- Include routers -----------------------------------------------------------

app.include_router(products.router)
app.include_router(categories.router)
app.include_router(vendors.router)
