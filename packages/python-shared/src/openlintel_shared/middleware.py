"""
FastAPI middleware stack for all OpenLintel Python services.

Provides:

* **CORS** — configured from ``Settings.CORS_ORIGINS``.
* **Request-ID** — injects or propagates ``X-Request-ID`` on every request.
* **Structured Logging** — logs method, path, status, and duration via ``structlog``.
"""

from __future__ import annotations

import time
import uuid
from typing import Callable

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from openlintel_shared.config import Settings, get_settings

logger = structlog.get_logger(__name__)


def setup_middleware(app: FastAPI, settings: Settings | None = None) -> None:
    """Attach all standard middleware to a FastAPI application.

    Call this once during application startup::

        app = FastAPI()
        setup_middleware(app)

    Parameters
    ----------
    app:
        The FastAPI application instance.
    settings:
        Optional settings override.
    """
    if settings is None:
        settings = get_settings()

    # Order matters: outermost middleware runs first.

    # 1. CORS — must be outermost so preflight responses are handled correctly
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    # 2. Request-ID
    app.add_middleware(RequestIDMiddleware)

    # 3. Structured logging
    app.add_middleware(StructuredLoggingMiddleware, service_name=settings.SERVICE_NAME)


# ── Request-ID Middleware ─────────────────────────────────────────────────────


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Propagate or generate a unique ``X-Request-ID`` header.

    If the incoming request already carries the header (e.g. from an API
    gateway) that value is reused; otherwise a new UUID-4 is generated.  The
    ID is attached to both ``request.state`` and the response headers so that
    downstream code and callers can correlate logs.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Bind to structlog context so all log lines carry the request ID
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ── Structured Logging Middleware ─────────────────────────────────────────────


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status code, and duration.

    Parameters
    ----------
    app:
        The ASGI application.
    service_name:
        Service name included in every log line for multi-service filtering.
    """

    def __init__(self, app: Callable, service_name: str = "openlintel") -> None:  # type: ignore[type-arg]
        super().__init__(app)  # type: ignore[arg-type]
        self.service_name = service_name

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        start = time.perf_counter()
        response: Response | None = None
        try:
            response = await call_next(request)
            return response
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            status_code = response.status_code if response else 500
            logger.info(
                "http_request",
                service=self.service_name,
                method=request.method,
                path=request.url.path,
                status=status_code,
                duration_ms=duration_ms,
                request_id=getattr(request.state, "request_id", None),
            )


# ── Structlog Configuration ──────────────────────────────────────────────────


def configure_logging(settings: Settings | None = None) -> None:
    """Configure ``structlog`` with sensible defaults for JSON/console output.

    Call this at application startup *before* any logging occurs::

        from openlintel_shared.middleware import configure_logging
        configure_logging()

    Parameters
    ----------
    settings:
        Optional settings override.
    """
    if settings is None:
        settings = get_settings()

    log_level = settings.LOG_LEVEL.upper()

    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer()
            if log_level == "DEBUG"
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            structlog.get_level_from_name(log_level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
