"""
Upload router — accepts multipart file uploads, validates, optimizes,
generates thumbnails, stores in MinIO, and returns metadata with presigned URLs.
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from typing import Annotated

import boto3
from botocore.config import Config as BotoConfig
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from PIL import Image

from openlintel_shared.auth import get_current_user
from openlintel_shared.config import Settings, get_settings

from src.models.media import MediaMetadata, MediaUploadResponse
from src.services.metadata import compute_image_hash, extract_metadata
from src.services.optimizer import generate_thumbnail, optimize_image
from src.services.validator import validate_file

router = APIRouter(prefix="/api/v1/media", tags=["media"])


def _get_s3_client(settings: Settings):  # noqa: ANN202
    """Create a boto3 S3 client configured for MinIO."""
    endpoint = settings.MINIO_ENDPOINT
    # Strip trailing slash if present
    endpoint = endpoint.rstrip("/")

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
        region_name=settings.MINIO_REGION,
        config=BotoConfig(signature_version="s3v4"),
    )


def _generate_presigned_url(
    s3_client,  # noqa: ANN001
    bucket: str,
    key: str,
    expires_in: int = 3600,
) -> str:
    """Generate a presigned GET URL for an object in MinIO/S3."""
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_in,
    )


def _mime_to_extension(mime_type: str) -> str:
    """Map MIME type to a file extension."""
    mapping: dict[str, str] = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
    }
    return mapping.get(mime_type, ".bin")


def _build_metadata(
    image_bytes: bytes,
    mime_type: str,
    original_size: int,
) -> MediaMetadata:
    """Build a ``MediaMetadata`` object from the image bytes."""
    exif = extract_metadata(image_bytes)
    image_hash = compute_image_hash(image_bytes)

    # For PDFs we cannot extract pixel dimensions
    if mime_type == "application/pdf":
        return MediaMetadata(
            width=0,
            height=0,
            format="PDF",
            mode="N/A",
            file_size_bytes=original_size,
            has_alpha=False,
            image_hash=image_hash,
            exif=exif,
        )

    img = Image.open(io.BytesIO(image_bytes))
    return MediaMetadata(
        width=img.width,
        height=img.height,
        format=img.format or mime_type.split("/")[-1].upper(),
        mode=img.mode,
        file_size_bytes=original_size,
        has_alpha=img.mode in ("RGBA", "LA", "PA"),
        image_hash=image_hash,
        exif=exif,
    )


@router.post(
    "/upload",
    response_model=MediaUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a media file",
    description=(
        "Accept a multipart file upload, validate format and size, optimize the "
        "image, generate a thumbnail, store both in MinIO, and return metadata "
        "with presigned download URLs."
    ),
)
async def upload_media(
    file: Annotated[UploadFile, File(description="The file to upload")],
    user_id: Annotated[str, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    project_id: str | None = Query(None, description="Optional project to attach the upload to"),
    room_id: str | None = Query(None, description="Optional room to attach the upload to"),
    category: str = Query("photo", description="Asset category: photo, floor_plan, document"),
) -> MediaUploadResponse:
    """Upload, validate, optimize, and store a media file."""

    # ── Read file bytes ───────────────────────────────────────────────────
    file_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"
    original_filename = file.filename or "untitled"
    original_size = len(file_bytes)

    # ── Validate ──────────────────────────────────────────────────────────
    result = validate_file(file_bytes, content_type)
    if not result.valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.error,
        )

    # ── Optimize (images only) ────────────────────────────────────────────
    is_image = content_type.startswith("image/")
    if is_image:
        optimized_bytes = optimize_image(file_bytes, content_type)
        thumbnail_bytes = generate_thumbnail(file_bytes)
    else:
        # PDFs and other non-image files pass through as-is
        optimized_bytes = file_bytes
        thumbnail_bytes = b""

    # ── Build metadata ────────────────────────────────────────────────────
    metadata = _build_metadata(file_bytes, content_type, original_size)

    # ── Generate storage keys ─────────────────────────────────────────────
    media_id = str(uuid.uuid4())
    ext = _mime_to_extension(content_type)
    now = datetime.now(tz=timezone.utc)
    date_prefix = now.strftime("%Y/%m/%d")

    storage_key = f"uploads/{user_id}/{date_prefix}/{media_id}{ext}"
    thumbnail_key = f"uploads/{user_id}/{date_prefix}/{media_id}_thumb.jpg" if thumbnail_bytes else ""

    # ── Upload to MinIO ───────────────────────────────────────────────────
    s3 = _get_s3_client(settings)
    bucket = settings.MINIO_BUCKET

    s3.put_object(
        Bucket=bucket,
        Key=storage_key,
        Body=optimized_bytes,
        ContentType=content_type,
        Metadata={
            "original-filename": original_filename,
            "user-id": user_id,
            "media-id": media_id,
            "category": category,
            "image-hash": metadata.image_hash,
        },
    )

    if thumbnail_bytes:
        s3.put_object(
            Bucket=bucket,
            Key=thumbnail_key,
            Body=thumbnail_bytes,
            ContentType="image/jpeg",
            Metadata={
                "media-id": media_id,
                "kind": "thumbnail",
            },
        )

    # ── Generate presigned URLs ───────────────────────────────────────────
    url = _generate_presigned_url(s3, bucket, storage_key)
    thumbnail_url = (
        _generate_presigned_url(s3, bucket, thumbnail_key) if thumbnail_key else ""
    )

    return MediaUploadResponse(
        media_id=media_id,
        filename=original_filename,
        mime_type=content_type,
        size_bytes=len(optimized_bytes),
        original_size_bytes=original_size,
        url=url,
        thumbnail_url=thumbnail_url,
        metadata=metadata,
        created_at=now,
    )
