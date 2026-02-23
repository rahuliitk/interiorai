"""
File upload validation.

Checks MIME type, file size, image resolution, and whether the file is corrupt
before allowing it through the upload pipeline.
"""

from __future__ import annotations

import io
from typing import NamedTuple

from PIL import Image

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_MIME_TYPES: dict[str, list[str]] = {
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/webp": [".webp"],
    "image/gif": [".gif"],
    "application/pdf": [".pdf"],
}

# 20 MB
MAX_FILE_SIZE: int = 20 * 1024 * 1024

# Maximum resolution (width or height) in pixels — 16384 px
MAX_RESOLUTION: int = 16384

# Minimum resolution — reject tiny garbage uploads
MIN_RESOLUTION: int = 32


class ValidationResult(NamedTuple):
    """Outcome of file validation."""

    valid: bool
    error: str | None


def _check_mime_type(content_type: str) -> ValidationResult:
    """Verify the MIME type is in the allow list."""
    if content_type not in ALLOWED_MIME_TYPES:
        allowed = ", ".join(sorted(ALLOWED_MIME_TYPES.keys()))
        return ValidationResult(
            valid=False,
            error=f"Unsupported file type '{content_type}'. Allowed types: {allowed}",
        )
    return ValidationResult(valid=True, error=None)


def _check_file_size(size_bytes: int) -> ValidationResult:
    """Reject files that exceed the maximum upload size."""
    if size_bytes > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE / (1024 * 1024)
        actual_mb = size_bytes / (1024 * 1024)
        return ValidationResult(
            valid=False,
            error=f"File too large ({actual_mb:.1f} MB). Maximum allowed size is {max_mb:.0f} MB.",
        )
    if size_bytes == 0:
        return ValidationResult(valid=False, error="File is empty (0 bytes).")
    return ValidationResult(valid=True, error=None)


def _check_image_integrity(file_bytes: bytes, content_type: str) -> ValidationResult:
    """Open the image with Pillow to detect corruption and validate resolution.

    PDFs are skipped — Pillow cannot open them.
    """
    if content_type == "application/pdf":
        # PDFs pass through without pixel-level validation
        return ValidationResult(valid=True, error=None)

    try:
        img = Image.open(io.BytesIO(file_bytes))
        # Pillow lazily decodes; calling .verify() checks for corruption
        img.verify()
    except Exception:
        return ValidationResult(valid=False, error="File appears to be corrupt or not a valid image.")

    # Re-open after verify (verify leaves the image in an unusable state)
    img = Image.open(io.BytesIO(file_bytes))
    width, height = img.size

    if width > MAX_RESOLUTION or height > MAX_RESOLUTION:
        return ValidationResult(
            valid=False,
            error=(
                f"Image resolution {width}x{height} exceeds maximum "
                f"{MAX_RESOLUTION}x{MAX_RESOLUTION} pixels."
            ),
        )

    if width < MIN_RESOLUTION or height < MIN_RESOLUTION:
        return ValidationResult(
            valid=False,
            error=(
                f"Image resolution {width}x{height} is below the minimum "
                f"{MIN_RESOLUTION}x{MIN_RESOLUTION} pixels."
            ),
        )

    return ValidationResult(valid=True, error=None)


def validate_file(
    file_bytes: bytes,
    content_type: str,
) -> ValidationResult:
    """Run all validations on an uploaded file.

    Parameters
    ----------
    file_bytes:
        The raw bytes of the uploaded file.
    content_type:
        The declared MIME type (from the ``Content-Type`` header or the
        ``UploadFile.content_type`` attribute).

    Returns
    -------
    ValidationResult
        ``(True, None)`` when all checks pass, or ``(False, error_message)``
        on the first failing check.
    """
    # 1. MIME type
    result = _check_mime_type(content_type)
    if not result.valid:
        return result

    # 2. File size
    result = _check_file_size(len(file_bytes))
    if not result.valid:
        return result

    # 3. Image integrity and resolution
    result = _check_image_integrity(file_bytes, content_type)
    if not result.valid:
        return result

    return ValidationResult(valid=True, error=None)
