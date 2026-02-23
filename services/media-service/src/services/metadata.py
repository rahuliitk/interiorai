"""
Image metadata extraction and perceptual hashing.

Extracts EXIF data (camera model, GPS, orientation, timestamps) and computes
a perceptual hash for deduplication.
"""

from __future__ import annotations

import hashlib
import io
from typing import Any

from PIL import Image
from PIL.ExifTags import GPSTAGS, TAGS


def _safe_exif_value(value: Any) -> Any:
    """Convert EXIF values to JSON-serialisable Python primitives."""
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", errors="replace")
        except Exception:
            return value.hex()
    if isinstance(value, tuple):
        return [_safe_exif_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _safe_exif_value(v) for k, v in value.items()}
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def _decode_gps_info(gps_data: dict[int, Any]) -> dict[str, Any]:
    """Translate numeric EXIF GPS tag IDs into human-readable names."""
    decoded: dict[str, Any] = {}
    for tag_id, raw_value in gps_data.items():
        tag_name = GPSTAGS.get(tag_id, str(tag_id))
        decoded[tag_name] = _safe_exif_value(raw_value)
    return decoded


def extract_metadata(image_bytes: bytes) -> dict[str, Any]:
    """Extract EXIF and basic image metadata from raw image bytes.

    Parameters
    ----------
    image_bytes:
        Raw bytes of the image file.

    Returns
    -------
    dict
        A JSON-serialisable dictionary with keys such as ``Make``, ``Model``,
        ``DateTime``, ``GPSInfo``, ``ImageWidth``, ``ImageLength``, etc.
        Returns an empty dict when the image has no EXIF data or is not a
        format that supports EXIF (e.g. PNG).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception:
        return {}

    exif_data = img.getexif()
    if not exif_data:
        return {}

    result: dict[str, Any] = {}
    for tag_id, raw_value in exif_data.items():
        tag_name = TAGS.get(tag_id, str(tag_id))

        # GPSInfo is a nested IFD — decode its sub-tags separately
        if tag_name == "GPSInfo" and isinstance(raw_value, dict):
            result["GPSInfo"] = _decode_gps_info(raw_value)
        else:
            result[tag_name] = _safe_exif_value(raw_value)

    return result


def compute_image_hash(image_bytes: bytes, hash_size: int = 16) -> str:
    """Compute a perceptual hash (difference hash / dHash) of an image.

    The hash is resilient to minor changes in compression, brightness, and
    scale, making it suitable for near-duplicate detection.

    Algorithm
    ---------
    1. Convert to grayscale.
    2. Resize to ``(hash_size + 1) x hash_size`` using LANCZOS.
    3. Compute horizontal gradient (is the left pixel brighter than the right?).
    4. Pack the resulting bits into a hex string.

    Parameters
    ----------
    image_bytes:
        Raw bytes of the image.
    hash_size:
        Controls the hash length.  The default of 16 produces a 256-bit
        (64 hex-character) hash.  8 produces a 64-bit hash.

    Returns
    -------
    str
        Hexadecimal string of the perceptual hash.  Falls back to a SHA-256
        content hash if the image cannot be decoded (e.g. for PDFs).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception:
        # Fallback: content-addressed hash for non-image files (PDFs, etc.)
        return hashlib.sha256(image_bytes).hexdigest()

    # Convert to greyscale
    grey = img.convert("L")

    # Resize to (hash_size + 1) columns x hash_size rows
    grey = grey.resize((hash_size + 1, hash_size), Image.LANCZOS)

    pixels = list(grey.getdata())
    width = hash_size + 1

    # Build the difference hash: compare adjacent pixels in each row
    bits: list[int] = []
    for row in range(hash_size):
        for col in range(hash_size):
            left = pixels[row * width + col]
            right = pixels[row * width + col + 1]
            bits.append(1 if left > right else 0)

    # Pack bits into an integer, then format as hex
    hash_int = 0
    for bit in bits:
        hash_int = (hash_int << 1) | bit

    # Total bits = hash_size * hash_size; hex digits = total_bits / 4
    hex_length = (hash_size * hash_size) // 4
    return f"{hash_int:0{hex_length}x}"
