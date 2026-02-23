"""
Drawing Generator — AI-powered technical drawing generation for OpenLintel.

Generates floor plans, furnished plans, elevations, sections, reflected ceiling
plans (RCP), electrical layouts, and flooring layouts as DXF, PDF, and SVG files
from room geometry and design variant data.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from pydantic import BaseModel

from openlintel_shared.config import get_settings
from openlintel_shared.db import dispose_engine
from openlintel_shared.middleware import configure_logging, setup_middleware
from openlintel_shared.redis_client import close_redis

from src.routers import drawings


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler.

    On startup: configure structured logging.
    On shutdown: close database and Redis connections gracefully.
    """
    settings = get_settings()
    configure_logging(settings)
    yield
    await dispose_engine()
    await close_redis()


app = FastAPI(
    title="OpenLintel Drawing Generator",
    description=(
        "Technical drawing generation service: AI-powered creation of floor plans, "
        "elevations, sections, RCP, electrical and flooring layouts. Outputs in "
        "DXF (AutoCAD), PDF (with title blocks), and SVG (web preview) formats."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# Attach standard middleware (CORS, request ID, structured logging)
setup_middleware(app)


# -- Health check -----------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    """Liveness probe -- returns 200 if the service is running."""
    return HealthResponse(status="ok", service="drawing-generator")


# -- Include routers -------------------------------------------------------

app.include_router(drawings.router)
