"""
BOM Engine — AI-powered Bill-of-Materials generation for OpenLintel.

Extracts material requirements from design variants, calculates quantities with
waste factors, looks up prices, optimizes budget allocation via OR-Tools, and
exports the final BOM in Excel, CSV, or PDF format.
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

from src.routers import bom


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
    title="OpenLintel BOM Engine",
    description=(
        "AI-powered Bill-of-Materials generation: material extraction via LLM, "
        "quantity calculation with waste factors, budget optimization via OR-Tools, "
        "and multi-format export (Excel, CSV, PDF)."
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
    return HealthResponse(status="ok", service="bom-engine")


# -- Include routers -------------------------------------------------------

app.include_router(bom.router)
