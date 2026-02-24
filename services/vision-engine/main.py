"""
Vision Engine — Floor plan digitization service for OpenLintel.

Uses VLM (GPT-4o via LiteLLM) to detect rooms from floor plan images.
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

from src.routers import vision
from src.routers import reconstruction

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings)
    logger.info("vision_engine_startup", service="vision-engine", log_level=settings.LOG_LEVEL)
    yield
    logger.info("vision_engine_shutdown")
    await dispose_engine()
    await close_redis()


app = FastAPI(
    title="OpenLintel Vision Engine",
    description="VLM-powered floor plan digitization — detects rooms, dimensions, and types from floor plan images.",
    version="0.1.0",
    lifespan=lifespan,
)

setup_middleware(app)


class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="vision-engine")


app.include_router(vision.router)
app.include_router(reconstruction.router)
