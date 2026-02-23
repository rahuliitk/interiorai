"""
OpenCV-based image preprocessing for scanned floor plans.

Prepares raster images for VLM extraction by:
1. Deskewing (correcting rotation from scanning).
2. Enhancing contrast (making lines crisp).
3. Adaptive thresholding (converting to clean binary).
4. Noise removal (eliminating scanning artifacts).
5. Optional perspective correction.

The goal is to produce a clean, high-contrast image that the VLM can
reliably interpret.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class PreprocessConfig:
    """Configuration for image preprocessing steps."""

    # Deskew
    enable_deskew: bool = True
    max_skew_degrees: float = 15.0

    # Contrast enhancement
    enable_contrast: bool = True
    clahe_clip_limit: float = 3.0
    clahe_tile_size: int = 8

    # Adaptive threshold
    enable_threshold: bool = True
    threshold_block_size: int = 31
    threshold_c: int = 10

    # Noise removal
    enable_denoise: bool = True
    morph_kernel_size: int = 3
    min_contour_area: int = 50

    # Perspective correction
    enable_perspective: bool = False

    # Output
    target_dpi: int = 300
    max_dimension: int = 4096


@dataclass
class PreprocessResult:
    """Result of image preprocessing."""

    image: np.ndarray
    original_size: tuple[int, int]
    processed_size: tuple[int, int]
    skew_angle: float = 0.0
    steps_applied: list[str] = field(default_factory=list)


class FloorPlanPreprocessor:
    """Preprocessor for scanned/photographed floor plan images.

    Parameters
    ----------
    config:
        Preprocessing configuration.  Uses sensible defaults if not provided.
    """

    def __init__(self, config: PreprocessConfig | None = None) -> None:
        self._config = config or PreprocessConfig()

    def process(self, image: np.ndarray | Image.Image) -> PreprocessResult:
        """Run the full preprocessing pipeline.

        Parameters
        ----------
        image:
            Input image as numpy BGR array or PIL Image.

        Returns
        -------
        PreprocessResult
            The preprocessed image and metadata.
        """
        if isinstance(image, Image.Image):
            img = np.array(image.convert("RGB"))
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        else:
            img = image.copy()

        original_size = (img.shape[1], img.shape[0])
        steps: list[str] = []

        # Resize if too large
        img = self._resize(img)
        if img.shape[:2] != (original_size[1], original_size[0]):
            steps.append("resize")

        # Convert to grayscale for processing
        if len(img.shape) == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img.copy()

        skew_angle = 0.0

        # Step 1: Deskew
        if self._config.enable_deskew:
            gray, skew_angle = self._deskew(gray)
            if abs(skew_angle) > 0.1:
                steps.append(f"deskew({skew_angle:.2f}deg)")

        # Step 2: Contrast enhancement
        if self._config.enable_contrast:
            gray = self._enhance_contrast(gray)
            steps.append("contrast_enhance")

        # Step 3: Adaptive threshold
        if self._config.enable_threshold:
            gray = self._adaptive_threshold(gray)
            steps.append("adaptive_threshold")

        # Step 4: Noise removal
        if self._config.enable_denoise:
            gray = self._remove_noise(gray)
            steps.append("denoise")

        processed_size = (gray.shape[1], gray.shape[0])

        logger.info(
            "Preprocessing complete: %s -> %s, steps=%s",
            original_size,
            processed_size,
            steps,
        )

        return PreprocessResult(
            image=gray,
            original_size=original_size,
            processed_size=processed_size,
            skew_angle=skew_angle,
            steps_applied=steps,
        )

    def process_from_bytes(self, image_bytes: bytes) -> PreprocessResult:
        """Convenience: preprocess from raw image bytes."""
        import io

        pil_image = Image.open(io.BytesIO(image_bytes))
        return self.process(pil_image)

    def _resize(self, img: np.ndarray) -> np.ndarray:
        """Resize image if it exceeds the maximum dimension."""
        h, w = img.shape[:2]
        max_dim = self._config.max_dimension

        if max(h, w) <= max_dim:
            return img

        scale = max_dim / max(h, w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    def _deskew(self, gray: np.ndarray) -> tuple[np.ndarray, float]:
        """Detect and correct document skew.

        Uses the Hough Line Transform to detect the dominant line angle,
        then rotates to correct.
        """
        max_skew = self._config.max_skew_degrees

        # Edge detection for line finding
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)

        # Hough Line Transform
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=100,
            minLineLength=100,
            maxLineGap=10,
        )

        if lines is None or len(lines) == 0:
            return gray, 0.0

        # Compute angles of all detected lines
        angles: list[float] = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            # Normalise to [-45, 45] range (we only care about small skews)
            if angle > 45:
                angle -= 90
            elif angle < -45:
                angle += 90
            if abs(angle) <= max_skew:
                angles.append(angle)

        if not angles:
            return gray, 0.0

        # Use median angle as the skew estimate (robust to outliers)
        skew_angle = float(np.median(angles))

        if abs(skew_angle) < 0.1:
            return gray, 0.0

        # Rotate to correct skew
        h, w = gray.shape[:2]
        center = (w // 2, h // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, skew_angle, 1.0)
        rotated = cv2.warpAffine(
            gray,
            rotation_matrix,
            (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )

        return rotated, skew_angle

    def _enhance_contrast(self, gray: np.ndarray) -> np.ndarray:
        """Apply CLAHE (Contrast Limited Adaptive Histogram Equalisation)."""
        clahe = cv2.createCLAHE(
            clipLimit=self._config.clahe_clip_limit,
            tileGridSize=(
                self._config.clahe_tile_size,
                self._config.clahe_tile_size,
            ),
        )
        return clahe.apply(gray)

    def _adaptive_threshold(self, gray: np.ndarray) -> np.ndarray:
        """Apply adaptive thresholding to produce a clean binary image.

        Uses Gaussian adaptive thresholding which handles varying
        illumination across the scan.
        """
        # Ensure block size is odd
        block_size = self._config.threshold_block_size
        if block_size % 2 == 0:
            block_size += 1

        binary = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block_size,
            self._config.threshold_c,
        )

        # Invert back so walls/lines are dark on white background
        return cv2.bitwise_not(binary)

    def _remove_noise(self, gray: np.ndarray) -> np.ndarray:
        """Remove small noise artifacts using morphological operations.

        1. Close small gaps in lines (morphological closing).
        2. Remove small isolated blobs (contour area filtering).
        """
        kernel_size = self._config.morph_kernel_size
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, (kernel_size, kernel_size)
        )

        # Morphological closing to bridge small gaps
        closed = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel, iterations=1)

        # Morphological opening to remove small noise
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel, iterations=1)

        # Remove small contours (noise blobs)
        min_area = self._config.min_contour_area

        # Invert for contour finding (contours need white on black)
        inverted = cv2.bitwise_not(opened)
        contours, _ = cv2.findContours(
            inverted, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE
        )

        # Create mask of contours to remove
        noise_mask = np.zeros_like(inverted)
        for contour in contours:
            if cv2.contourArea(contour) < min_area:
                cv2.drawContours(noise_mask, [contour], -1, 255, -1)

        # Remove noise by setting small contours to white (background)
        result = opened.copy()
        result[noise_mask > 0] = 255

        return result

    @staticmethod
    def detect_scale_bar(gray: np.ndarray) -> float | None:
        """Attempt to detect a scale bar in the image.

        Returns the estimated mm-per-pixel ratio if a scale bar is found,
        or ``None`` if detection fails.

        This is a heuristic: it looks for horizontal lines near the bottom
        of the image that could be scale bars.
        """
        h, w = gray.shape[:2]

        # Focus on the bottom 20% of the image
        bottom_region = gray[int(h * 0.8) :, :]

        # Find horizontal lines
        edges = cv2.Canny(bottom_region, 50, 150)
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=50,
            minLineLength=w // 10,
            maxLineGap=5,
        )

        if lines is None:
            return None

        # Look for horizontal lines (angle close to 0)
        horizontal_lines: list[tuple[int, int, int, int]] = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
            if angle < 5:  # Nearly horizontal
                length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
                horizontal_lines.append((x1, y1, x2, y2))

        if not horizontal_lines:
            return None

        # The scale bar is typically the longest horizontal line in the region
        longest = max(horizontal_lines, key=lambda l: abs(l[2] - l[0]))
        pixel_length = abs(longest[2] - longest[0])

        # Without OCR we cannot read the scale value, so return pixel length
        # The caller must determine the actual scale from context
        logger.info("Potential scale bar detected: %d pixels wide", pixel_length)
        return None  # Cannot determine mm/px without reading the scale text
