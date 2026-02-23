"""
Centralised application settings powered by pydantic-settings.

Every Python micro-service imports ``get_settings()`` to obtain a validated,
type-safe configuration object.  Values are read from environment variables
(and ``.env`` files when running locally).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Root settings consumed by all OpenLintel Python services."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://openlintel:openlintel_dev@localhost:5432/openlintel"

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ── MinIO / S3 ────────────────────────────────────────────────────────────
    MINIO_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "openlintel-uploads"
    MINIO_REGION: str = "us-east-1"
    MINIO_USE_SSL: bool = False

    # ── Auth / Security ───────────────────────────────────────────────────────
    JWT_SECRET: str = "replace-with-a-secure-random-string"
    JWT_ALGORITHM: str = "HS256"
    API_KEY_ENCRYPTION_SECRET: str = "replace-with-64-char-hex-string"

    # ── Observability ─────────────────────────────────────────────────────────
    LOG_LEVEL: Literal["debug", "info", "warning", "error", "critical"] = "info"

    # ── CORS ──────────────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # ── Service ───────────────────────────────────────────────────────────────
    SERVICE_NAME: str = "openlintel"

    @property
    def async_database_url(self) -> str:
        """Return the DATABASE_URL guaranteed to use the ``asyncpg`` driver."""
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton ``Settings`` instance."""
    return Settings()
