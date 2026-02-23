"""
MinIO / S3 object storage wrapper.

Provides a thin, async-friendly abstraction over ``boto3`` configured for the
MinIO instance declared in ``docker-compose.yml``.  All public functions are
synchronous (boto3 does not support ``asyncio`` natively) but are designed to
be called from ``asyncio.to_thread`` or directly in sync code paths.
"""

from __future__ import annotations

import io
from typing import TYPE_CHECKING

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from openlintel_shared.config import Settings, get_settings

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client


_client_cache: S3Client | None = None


def _get_client(settings: Settings | None = None) -> S3Client:
    """Return a cached ``boto3`` S3 client configured for MinIO."""
    global _client_cache  # noqa: PLW0603
    if _client_cache is not None:
        return _client_cache

    if settings is None:
        settings = get_settings()

    _client_cache = boto3.client(
        "s3",
        endpoint_url=settings.MINIO_ENDPOINT,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        region_name=settings.MINIO_REGION,
        use_ssl=settings.MINIO_USE_SSL,
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
    )  # type: ignore[assignment]
    return _client_cache  # type: ignore[return-value]


def reset_client() -> None:
    """Drop the cached client (useful in tests)."""
    global _client_cache  # noqa: PLW0603
    _client_cache = None


# ── Public API ────────────────────────────────────────────────────────────────


def ensure_bucket(bucket: str, *, settings: Settings | None = None) -> None:
    """Create the bucket if it does not already exist.

    Parameters
    ----------
    bucket:
        The bucket name.
    settings:
        Optional override for configuration.
    """
    client = _get_client(settings)
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as exc:
        error_code = int(exc.response.get("Error", {}).get("Code", 0))
        if error_code == 404:
            client.create_bucket(Bucket=bucket)
        else:
            raise


def upload_file(
    bucket: str,
    key: str,
    data: bytes | io.IOBase,
    content_type: str = "application/octet-stream",
    *,
    settings: Settings | None = None,
) -> None:
    """Upload a file to the specified bucket.

    Parameters
    ----------
    bucket:
        Target bucket name.
    key:
        Object key (path inside the bucket).
    data:
        File contents as ``bytes`` or a file-like object.
    content_type:
        MIME type stored as object metadata.
    settings:
        Optional override for configuration.
    """
    client = _get_client(settings)
    if isinstance(data, bytes):
        data = io.BytesIO(data)
    client.upload_fileobj(
        Fileobj=data,  # type: ignore[arg-type]
        Bucket=bucket,
        Key=key,
        ExtraArgs={"ContentType": content_type},
    )


def download_file(
    bucket: str,
    key: str,
    *,
    settings: Settings | None = None,
) -> bytes:
    """Download a file and return its contents as bytes.

    Parameters
    ----------
    bucket:
        Source bucket name.
    key:
        Object key.
    settings:
        Optional override for configuration.

    Returns
    -------
    bytes
        The object's contents.
    """
    client = _get_client(settings)
    buf = io.BytesIO()
    client.download_fileobj(Bucket=bucket, Key=key, Fileobj=buf)
    buf.seek(0)
    return buf.read()


def delete_file(
    bucket: str,
    key: str,
    *,
    settings: Settings | None = None,
) -> None:
    """Delete an object from a bucket.

    Parameters
    ----------
    bucket:
        Bucket name.
    key:
        Object key.
    settings:
        Optional override for configuration.
    """
    client = _get_client(settings)
    client.delete_object(Bucket=bucket, Key=key)


def generate_presigned_url(
    bucket: str,
    key: str,
    expires: int = 3600,
    *,
    settings: Settings | None = None,
) -> str:
    """Generate a presigned GET URL for an object.

    Parameters
    ----------
    bucket:
        Bucket name.
    key:
        Object key.
    expires:
        Link lifetime in seconds (default 1 hour).
    settings:
        Optional override for configuration.

    Returns
    -------
    str
        The presigned URL.
    """
    client = _get_client(settings)
    url: str = client.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires,
    )
    return url
