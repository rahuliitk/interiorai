"""
Media Service — FastAPI application for OpenLintel.

Handles file upload validation, image optimization, thumbnail generation,
and metadata extraction.  Stores assets in MinIO (S3-compatible object storage).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from openlintel_shared.config import get_settings

from src.routers import assets, upload

logger = logging.getLogger("media-service")


# ---------------------------------------------------------------------------
# Lifespan — ensure MinIO bucket exists on startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler.

    On startup: ensure the configured MinIO bucket exists (create it if not).
    """
    settings = get_settings()
    endpoint = settings.MINIO_ENDPOINT.rstrip("/")
    bucket = settings.MINIO_BUCKET

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        region_name=settings.MINIO_REGION,
        config=BotoConfig(signature_version="s3v4"),
    )

    try:
        s3.head_bucket(Bucket=bucket)
        logger.info("MinIO bucket '%s' already exists.", bucket)
    except ClientError:
        logger.info("Creating MinIO bucket '%s' ...", bucket)
        try:
            s3.create_bucket(
                Bucket=bucket,
                CreateBucketConfiguration={"LocationConstraint": settings.MINIO_REGION},
            )
            logger.info("MinIO bucket '%s' created successfully.", bucket)
        except ClientError as exc:
            # If the error is BucketAlreadyOwnedByYou, that's fine
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                logger.info("MinIO bucket '%s' already exists (race condition).", bucket)
            else:
                logger.error("Failed to create MinIO bucket '%s': %s", bucket, exc)
                raise

    yield  # App is running

    # Shutdown: nothing to clean up for now
    logger.info("Media service shutting down.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OpenLintel Media Service",
    description=(
        "File upload validation, image optimization, thumbnail generation, "
        "and metadata extraction for the OpenLintel interior design platform."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS middleware ────────────────────────────────────────────────────────
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    service: str


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health_check() -> HealthResponse:
    """Liveness probe — returns 200 if the service is running."""
    return HealthResponse(status="ok", service="media-service")


# ── Include routers ───────────────────────────────────────────────────────
app.include_router(upload.router)
app.include_router(assets.router)
