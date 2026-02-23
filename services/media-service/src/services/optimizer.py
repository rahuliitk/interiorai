"""
Image optimization and thumbnail generation.

Resizes overly large images, compresses based on format, and generates
square-cropped thumbnails for gallery display.
"""

from __future__ import annotations

import io

from PIL import Image

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Images wider than this are resized down (maintains aspect ratio)
MAX_WIDTH: int = 4096

# Format-specific compression settings
JPEG_QUALITY: int = 85
PNG_OPTIMIZE: bool = True
WEBP_QUALITY: int = 80

# Default thumbnail size (longest edge)
DEFAULT_THUMBNAIL_SIZE: int = 256


def _mime_to_pillow_format(mime_type: str) -> str:
    """Map a MIME type to the Pillow format string used by ``Image.save``."""
    mapping: dict[str, str] = {
        "image/jpeg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
        "image/gif": "GIF",
    }
    return mapping.get(mime_type, "JPEG")


def _ensure_rgb(img: Image.Image, target_format: str) -> Image.Image:
    """Convert RGBA/P/LA images to RGB when saving to formats that don't support alpha."""
    if target_format in ("JPEG",) and img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
        return background
    return img


def optimize_image(image_bytes: bytes, mime_type: str) -> bytes:
    """Optimize an image for storage and delivery.

    The optimization pipeline:
    1. Resize if width exceeds ``MAX_WIDTH`` (4096 px), preserving aspect ratio.
    2. Compress using format-appropriate settings:
       - JPEG: quality=85, optimized
       - PNG: optimized, maximum compression
       - WebP: quality=80
       - GIF: passed through unchanged

    Parameters
    ----------
    image_bytes:
        Raw bytes of the original image.
    mime_type:
        MIME type of the image (e.g. ``image/jpeg``).

    Returns
    -------
    bytes
        The optimized image bytes in the same format.
    """
    pillow_format = _mime_to_pillow_format(mime_type)

    # GIF: pass through without re-encoding to preserve animation frames
    if pillow_format == "GIF":
        return image_bytes

    img = Image.open(io.BytesIO(image_bytes))

    # ── Resize if too wide ────────────────────────────────────────────────
    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        new_height = int(img.height * ratio)
        img = img.resize((MAX_WIDTH, new_height), Image.LANCZOS)

    # ── Convert colour mode ───────────────────────────────────────────────
    img = _ensure_rgb(img, pillow_format)

    # ── Compress ──────────────────────────────────────────────────────────
    output = io.BytesIO()

    if pillow_format == "JPEG":
        img.save(
            output,
            format="JPEG",
            quality=JPEG_QUALITY,
            optimize=True,
            progressive=True,
        )
    elif pillow_format == "PNG":
        img.save(
            output,
            format="PNG",
            optimize=PNG_OPTIMIZE,
        )
    elif pillow_format == "WEBP":
        img.save(
            output,
            format="WEBP",
            quality=WEBP_QUALITY,
            method=4,  # compression effort (0-6, higher = slower but smaller)
        )
    else:
        img.save(output, format=pillow_format)

    return output.getvalue()


def generate_thumbnail(image_bytes: bytes, size: int = DEFAULT_THUMBNAIL_SIZE) -> bytes:
    """Generate a JPEG thumbnail from an image.

    The thumbnail is created by fitting the image into a ``size x size``
    bounding box while preserving the aspect ratio (no cropping, no
    distortion).  The result is always saved as JPEG.

    Parameters
    ----------
    image_bytes:
        Raw bytes of the source image (any Pillow-supported format).
    size:
        Maximum dimension (width or height) of the thumbnail.
        Defaults to 256 px.

    Returns
    -------
    bytes
        JPEG-encoded thumbnail bytes.
    """
    img = Image.open(io.BytesIO(image_bytes))

    # Convert palette and alpha modes to RGB for JPEG output
    if img.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        if "A" in img.mode:
            background.paste(img, mask=img.split()[-1])
        else:
            background.paste(img)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # LANCZOS (antialiased) downscale within bounding box
    img.thumbnail((size, size), Image.LANCZOS)

    output = io.BytesIO()
    img.save(output, format="JPEG", quality=80, optimize=True)
    return output.getvalue()
