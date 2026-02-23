"""
openlintel_shared — Shared Python library for the OpenLintel interior design platform.

Provides configuration, authentication, storage, database, caching, middleware,
domain schemas, cryptographic utilities, and LLM orchestration helpers that are
consumed by all Python micro-services (design-engine, bom-engine, cutlist-engine,
drawing-generator, media-service, mep-calculator, etc.).
"""

from openlintel_shared.config import Settings, get_settings

__all__ = [
    "Settings",
    "get_settings",
]

__version__ = "0.1.0"
