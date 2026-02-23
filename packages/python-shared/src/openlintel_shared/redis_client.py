"""
Redis client with cache helpers and pub/sub utilities.

Uses ``redis.asyncio`` (with the ``hiredis`` parser for performance).
"""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis
import structlog

from openlintel_shared.config import Settings, get_settings

logger = structlog.get_logger(__name__)

_pool: aioredis.Redis | None = None  # type: ignore[type-arg]


def get_redis(settings: Settings | None = None) -> aioredis.Redis:  # type: ignore[type-arg]
    """Return a cached async Redis client.

    The client is backed by a connection pool and is safe to share across
    concurrent tasks.

    Parameters
    ----------
    settings:
        Optional settings override (useful in tests).

    Returns
    -------
    redis.asyncio.Redis
        The async Redis client.
    """
    global _pool  # noqa: PLW0603
    if _pool is not None:
        return _pool

    if settings is None:
        settings = get_settings()

    _pool = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        max_connections=20,
    )
    return _pool


async def close_redis() -> None:
    """Close the Redis connection pool.

    Call this in your FastAPI ``shutdown`` lifespan event.
    """
    global _pool  # noqa: PLW0603
    if _pool is not None:
        await _pool.aclose()
        _pool = None


# ── Cache Helpers ─────────────────────────────────────────────────────────────


async def cache_get(key: str, *, settings: Settings | None = None) -> Any | None:
    """Retrieve a JSON-serialised value from Redis.

    Parameters
    ----------
    key:
        The cache key.
    settings:
        Optional settings override.

    Returns
    -------
    Any | None
        The deserialised Python object, or ``None`` on cache miss.
    """
    client = get_redis(settings)
    raw = await client.get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


async def cache_set(
    key: str,
    value: Any,
    ttl: int = 3600,
    *,
    settings: Settings | None = None,
) -> None:
    """Store a JSON-serialisable value in Redis with a TTL.

    Parameters
    ----------
    key:
        The cache key.
    value:
        Any JSON-serialisable Python object.
    ttl:
        Time-to-live in seconds (default 1 hour).
    settings:
        Optional settings override.
    """
    client = get_redis(settings)
    serialised = json.dumps(value, default=str)
    await client.set(key, serialised, ex=ttl)


async def cache_delete(key: str, *, settings: Settings | None = None) -> None:
    """Delete a key from the cache.

    Parameters
    ----------
    key:
        The cache key to remove.
    settings:
        Optional settings override.
    """
    client = get_redis(settings)
    await client.delete(key)


# ── Pub/Sub Helpers ───────────────────────────────────────────────────────────


async def publish(channel: str, message: Any, *, settings: Settings | None = None) -> int:
    """Publish a message to a Redis channel.

    Parameters
    ----------
    channel:
        The channel name.
    message:
        Any JSON-serialisable payload.
    settings:
        Optional settings override.

    Returns
    -------
    int
        Number of subscribers that received the message.
    """
    client = get_redis(settings)
    serialised = json.dumps(message, default=str)
    count: int = await client.publish(channel, serialised)
    return count


async def subscribe(
    *channels: str,
    settings: Settings | None = None,
) -> aioredis.client.PubSub:
    """Subscribe to one or more Redis channels and return the ``PubSub`` object.

    Usage::

        pubsub = await subscribe("design:progress", "design:complete")
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                ...

    Parameters
    ----------
    *channels:
        One or more channel names.
    settings:
        Optional settings override.

    Returns
    -------
    redis.asyncio.client.PubSub
        The subscribed pub/sub object.
    """
    client = get_redis(settings)
    pubsub = client.pubsub()
    await pubsub.subscribe(*channels)
    return pubsub


async def check_redis_health(settings: Settings | None = None) -> bool:
    """Ping Redis to verify connectivity.

    Returns
    -------
    bool
        ``True`` if Redis responded to PING, ``False`` otherwise.
    """
    try:
        client = get_redis(settings)
        return await client.ping()
    except Exception:
        logger.exception("redis_health_check_failed")
        return False
