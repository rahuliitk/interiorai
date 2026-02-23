"""
Assets router — retrieve presigned URLs for stored media assets and thumbnails.

Assets are identified by ``media_id``.  The router looks up the corresponding
object in MinIO by listing objects with the media_id prefix, then generates a
time-limited presigned URL.
"""

from __future__ import annotations

from typing import Annotated

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, status

from openlintel_shared.auth import get_current_user
from openlintel_shared.config import Settings, get_settings

from src.models.media import MediaURLResponse

router = APIRouter(prefix="/api/v1/media", tags=["media"])

# Default presigned URL lifetime in seconds (1 hour)
_PRESIGN_EXPIRY: int = 3600


def _get_s3_client(settings: Settings):  # noqa: ANN202
    """Create a boto3 S3 client configured for MinIO."""
    endpoint = settings.MINIO_ENDPOINT.rstrip("/")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        region_name=settings.MINIO_REGION,
        config=BotoConfig(signature_version="s3v4"),
    )


def _find_object_key(
    s3_client,  # noqa: ANN001
    bucket: str,
    media_id: str,
    suffix: str = "",
) -> str | None:
    """Locate an object key in MinIO by listing objects whose key contains the media_id.

    Parameters
    ----------
    s3_client:
        boto3 S3 client.
    bucket:
        Name of the S3/MinIO bucket.
    media_id:
        UUID of the media asset.
    suffix:
        Optional suffix filter (e.g. ``_thumb.jpg``).

    Returns
    -------
    str | None
        The first matching object key, or ``None`` if not found.
    """
    # We store uploads under  uploads/{user_id}/{YYYY/MM/DD}/{media_id}{ext}
    # Use the prefix "uploads/" and a metadata filter via listing.
    # Since we cannot filter by metadata on list, we list a wide prefix
    # and filter client-side.  For production at scale this should be
    # backed by a database lookup — but for Phase 1 listing is acceptable.
    paginator = s3_client.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=bucket, Prefix="uploads/")

    for page in pages:
        for obj in page.get("Contents", []):
            key: str = obj["Key"]
            if media_id in key:
                if suffix and not key.endswith(suffix):
                    continue
                return key

    return None


def _find_original_key(
    s3_client,  # noqa: ANN001
    bucket: str,
    media_id: str,
) -> str | None:
    """Find the original (non-thumbnail) object key for a given media_id."""
    paginator = s3_client.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=bucket, Prefix="uploads/")

    for page in pages:
        for obj in page.get("Contents", []):
            key: str = obj["Key"]
            if media_id in key and not key.endswith("_thumb.jpg"):
                return key

    return None


def _generate_presigned_url(
    s3_client,  # noqa: ANN001
    bucket: str,
    key: str,
    expires_in: int = _PRESIGN_EXPIRY,
) -> str:
    """Generate a presigned GET URL for a MinIO/S3 object."""
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )


@router.get(
    "/{media_id}",
    response_model=MediaURLResponse,
    summary="Get presigned URL for a media asset",
    description="Return a time-limited presigned URL for the optimized media file.",
)
async def get_media_url(
    media_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> MediaURLResponse:
    """Look up the media asset in MinIO and return a presigned download URL."""
    s3 = _get_s3_client(settings)
    bucket = settings.MINIO_BUCKET

    # Find the original file — scan all keys containing the media_id and
    # return the one that is NOT a thumbnail.
    key = _find_original_key(s3, bucket, media_id)
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Media asset '{media_id}' not found.",
        )

    try:
        url = _generate_presigned_url(s3, bucket, key)
    except ClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate presigned URL: {exc}",
        ) from exc

    return MediaURLResponse(
        media_id=media_id,
        url=url,
        expires_in_seconds=_PRESIGN_EXPIRY,
    )


@router.get(
    "/{media_id}/thumbnail",
    response_model=MediaURLResponse,
    summary="Get presigned URL for a media thumbnail",
    description="Return a time-limited presigned URL for the thumbnail image.",
)
async def get_thumbnail_url(
    media_id: str,
    user_id: Annotated[str, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> MediaURLResponse:
    """Look up the thumbnail for the media asset and return a presigned URL."""
    s3 = _get_s3_client(settings)
    bucket = settings.MINIO_BUCKET

    key = _find_object_key(s3, bucket, media_id, suffix="_thumb.jpg")
    if key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Thumbnail for media asset '{media_id}' not found.",
        )

    try:
        url = _generate_presigned_url(s3, bucket, key)
    except ClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate presigned URL: {exc}",
        ) from exc

    return MediaURLResponse(
        media_id=media_id,
        url=url,
        expires_in_seconds=_PRESIGN_EXPIRY,
    )
