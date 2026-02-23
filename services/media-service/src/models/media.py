"""
Pydantic models for the Media Service.

These models define the request/response shapes for file uploads, asset
retrieval, and metadata payloads.  They mirror the ``uploads`` table in the
OpenLintel database schema.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MediaMetadata(BaseModel):
    """Image metadata extracted from EXIF and pixel analysis."""

    width: int = Field(..., description="Image width in pixels")
    height: int = Field(..., description="Image height in pixels")
    format: str = Field(..., description="Image format (e.g. JPEG, PNG, WebP)")
    mode: str = Field(..., description="Image colour mode (e.g. RGB, RGBA, L)")
    file_size_bytes: int = Field(..., description="Original file size in bytes")
    has_alpha: bool = Field(False, description="Whether the image has an alpha channel")
    image_hash: str = Field("", description="Perceptual hash for deduplication (hex)")
    exif: dict[str, Any] = Field(
        default_factory=dict,
        description="Extracted EXIF data (camera, GPS, orientation, etc.)",
    )


class MediaAsset(BaseModel):
    """A stored media asset with storage keys and metadata."""

    media_id: str = Field(..., description="Unique identifier for this media asset")
    user_id: str = Field(..., description="ID of the owning user")
    filename: str = Field(..., description="Original uploaded filename")
    mime_type: str = Field(..., description="MIME type of the stored file")
    size_bytes: int = Field(..., description="Size of the optimized file in bytes")
    storage_key: str = Field(..., description="Object key in MinIO for the optimized file")
    thumbnail_key: str = Field("", description="Object key in MinIO for the thumbnail")
    category: str = Field("photo", description="Asset category: photo, floor_plan, document")
    metadata: MediaMetadata = Field(..., description="Extracted image metadata")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MediaUploadResponse(BaseModel):
    """Response returned after a successful file upload."""

    media_id: str = Field(..., description="Unique identifier for the uploaded asset")
    filename: str = Field(..., description="Original filename")
    mime_type: str = Field(..., description="MIME type of the file")
    size_bytes: int = Field(..., description="Optimized file size in bytes")
    original_size_bytes: int = Field(..., description="Original file size before optimization")
    url: str = Field(..., description="Presigned URL to access the optimized file")
    thumbnail_url: str = Field("", description="Presigned URL for the thumbnail")
    metadata: MediaMetadata = Field(..., description="Extracted image metadata")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MediaURLResponse(BaseModel):
    """Response for asset URL retrieval endpoints."""

    media_id: str = Field(..., description="Media asset identifier")
    url: str = Field(..., description="Presigned URL (valid for a limited time)")
    expires_in_seconds: int = Field(3600, description="URL validity duration in seconds")
