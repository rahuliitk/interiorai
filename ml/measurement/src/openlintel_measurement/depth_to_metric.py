"""
Calibrated depth-to-metric conversion.

Takes a normalised relative depth map (0..1 from Depth Anything V2) and a
reference object with a known real-world dimension, then computes a per-pixel
scale factor that converts depth differences into millimetres.

The key insight: monocular depth models produce *relative* depth (inverse
disparity), not metric depth.  By measuring the pixel extent of a known
reference object and its depth value, we can derive a local scale factor.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np

from openlintel_measurement.calibration import CalibrationDB, ReferenceObject
from openlintel_measurement.schemas import (
    CalibrationInfo,
    CalibratedDimension,
    MeasurementConfidence,
    PointPair,
)

logger = logging.getLogger(__name__)


@dataclass
class CalibrationResult:
    """Internal calibration parameters."""

    scale_mm_per_pixel: float  # mm per pixel at the reference depth
    reference_depth: float  # Mean depth at the reference object
    reference_object: ReferenceObject
    confidence: MeasurementConfidence


class DepthToMetricConverter:
    """Converts relative depth maps to real-world measurements.

    The converter must be calibrated before use, either by calling
    ``calibrate()`` with a reference object or by providing pre-computed
    calibration parameters.

    Parameters
    ----------
    depth_array:
        Normalised relative depth map from Depth Anything V2 (shape: H x W,
        float32, 0..1 where 0 is nearest).
    """

    def __init__(self, depth_array: np.ndarray) -> None:
        if depth_array.ndim != 2:
            raise ValueError(f"Expected 2D depth array, got shape {depth_array.shape}")
        self._depth = depth_array.astype(np.float32)
        self._height, self._width = self._depth.shape
        self._calibration: CalibrationResult | None = None

    @property
    def is_calibrated(self) -> bool:
        return self._calibration is not None

    @property
    def calibration_info(self) -> CalibrationInfo | None:
        """Return calibration info as a Pydantic schema, or ``None``."""
        if self._calibration is None:
            return None
        cal = self._calibration
        return CalibrationInfo(
            reference_object=cal.reference_object.slug,
            reference_known_mm=cal.reference_object.primary_dimension_mm,
            reference_pixel_extent=cal.scale_mm_per_pixel,  # Will be recomputed
            scale_mm_per_pixel=cal.scale_mm_per_pixel,
            reference_depth=cal.reference_depth,
        )

    def calibrate(
        self,
        reference_slug: str,
        bbox_x_min: int,
        bbox_y_min: int,
        bbox_x_max: int,
        bbox_y_max: int,
        *,
        dimension_axis: str = "auto",
    ) -> CalibrationInfo:
        """Calibrate using a reference object visible in the image.

        Parameters
        ----------
        reference_slug:
            Slug of the reference object (e.g. ``"door"``, ``"a4_paper"``).
        bbox_x_min, bbox_y_min, bbox_x_max, bbox_y_max:
            Bounding box of the reference object in pixel coordinates.
        dimension_axis:
            Which bbox axis corresponds to the primary dimension:
            ``"height"`` (y-axis), ``"width"`` (x-axis), or ``"auto"``
            (infer from the reference object's primary dimension).

        Returns
        -------
        CalibrationInfo
            The computed calibration parameters.
        """
        ref = CalibrationDB.get(reference_slug)
        known_mm = ref.primary_dimension_mm

        # Determine pixel extent along the primary axis
        if dimension_axis == "auto":
            dimension_axis = ref.primary_dimension

        if dimension_axis == "height":
            pixel_extent = float(bbox_y_max - bbox_y_min)
        elif dimension_axis == "width":
            pixel_extent = float(bbox_x_max - bbox_x_min)
        elif dimension_axis == "depth":
            # For depth dimension, use the larger of width/height as proxy
            pixel_extent = float(max(bbox_x_max - bbox_x_min, bbox_y_max - bbox_y_min))
        else:
            raise ValueError(f"Unknown dimension_axis: {dimension_axis}")

        if pixel_extent <= 0:
            raise ValueError(
                f"Reference bounding box has zero or negative {dimension_axis} extent"
            )

        # Compute mean depth at the reference object
        y_min = max(0, min(bbox_y_min, self._height - 1))
        y_max = max(1, min(bbox_y_max, self._height))
        x_min = max(0, min(bbox_x_min, self._width - 1))
        x_max = max(1, min(bbox_x_max, self._width))

        ref_depth_region = self._depth[y_min:y_max, x_min:x_max]
        ref_depth_mean = float(np.mean(ref_depth_region))

        # Scale factor: mm per pixel at the reference depth
        scale_mm_per_pixel = known_mm / pixel_extent

        # Estimate confidence based on pixel extent
        if pixel_extent >= 100:
            confidence = MeasurementConfidence.HIGH
        elif pixel_extent >= 30:
            confidence = MeasurementConfidence.MEDIUM
        else:
            confidence = MeasurementConfidence.LOW

        self._calibration = CalibrationResult(
            scale_mm_per_pixel=scale_mm_per_pixel,
            reference_depth=ref_depth_mean,
            reference_object=ref,
            confidence=confidence,
        )

        logger.info(
            "Calibrated: ref=%s, known_mm=%.1f, pixel_extent=%.1f, "
            "scale=%.3f mm/px, ref_depth=%.4f, confidence=%s",
            ref.slug,
            known_mm,
            pixel_extent,
            scale_mm_per_pixel,
            ref_depth_mean,
            confidence.value,
        )

        return CalibrationInfo(
            reference_object=ref.slug,
            reference_known_mm=known_mm,
            reference_pixel_extent=pixel_extent,
            scale_mm_per_pixel=scale_mm_per_pixel,
            reference_depth=ref_depth_mean,
        )

    def measure_between_points(
        self,
        point_pair: PointPair,
        *,
        label: str = "measurement",
    ) -> CalibratedDimension:
        """Measure the real-world distance between two image points.

        The depth-adjusted measurement accounts for the relative depth of
        each point.  Points at different depths from the camera will have
        their pixel distances scaled accordingly.

        Parameters
        ----------
        point_pair:
            The two pixel coordinates to measure between.
        label:
            Human-readable label for this measurement.

        Returns
        -------
        CalibratedDimension
            The calibrated measurement in millimetres.
        """
        if not self.is_calibrated:
            raise RuntimeError("Converter must be calibrated before measuring. Call calibrate().")

        assert self._calibration is not None
        cal = self._calibration

        # Get depth at each point
        y1 = max(0, min(point_pair.y1, self._height - 1))
        x1 = max(0, min(point_pair.x1, self._width - 1))
        y2 = max(0, min(point_pair.y2, self._height - 1))
        x2 = max(0, min(point_pair.x2, self._width - 1))

        d1 = float(self._depth[y1, x1])
        d2 = float(self._depth[y2, x2])
        d_avg = (d1 + d2) / 2.0

        # Depth correction factor: objects closer to the camera appear larger
        # in pixel space than objects further away.  We scale the pixel
        # distance by the ratio of reference depth to measurement depth.
        if d_avg > 0 and cal.reference_depth > 0:
            depth_correction = cal.reference_depth / d_avg
        else:
            depth_correction = 1.0

        # Pixel distance
        pixel_dist = point_pair.pixel_distance

        # Metric distance
        metric_mm = pixel_dist * cal.scale_mm_per_pixel * depth_correction

        # Uncertainty increases with depth difference and distance from reference
        depth_diff = abs(d1 - d2)
        base_uncertainty = metric_mm * 0.05  # 5% base uncertainty
        depth_uncertainty = metric_mm * depth_diff * 0.5  # Depth disparity penalty
        uncertainty = base_uncertainty + depth_uncertainty

        return CalibratedDimension(
            label=label,
            value_mm=metric_mm,
            confidence=cal.confidence,
            uncertainty_mm=uncertainty,
            method="single_view_depth",
        )

    def measure_bbox_dimensions(
        self,
        bbox_x_min: int,
        bbox_y_min: int,
        bbox_x_max: int,
        bbox_y_max: int,
        *,
        label_prefix: str = "object",
    ) -> list[CalibratedDimension]:
        """Measure the width and height of a bounding box in millimetres.

        Parameters
        ----------
        bbox_x_min, bbox_y_min, bbox_x_max, bbox_y_max:
            Object bounding box in pixel coordinates.
        label_prefix:
            Prefix for the dimension labels.

        Returns
        -------
        list[CalibratedDimension]
            Two dimensions: ``[width, height]`` in millimetres.
        """
        width_pair = PointPair(
            x1=bbox_x_min, y1=(bbox_y_min + bbox_y_max) // 2,
            x2=bbox_x_max, y2=(bbox_y_min + bbox_y_max) // 2,
        )
        height_pair = PointPair(
            x1=(bbox_x_min + bbox_x_max) // 2, y1=bbox_y_min,
            x2=(bbox_x_min + bbox_x_max) // 2, y2=bbox_y_max,
        )

        return [
            self.measure_between_points(width_pair, label=f"{label_prefix} width"),
            self.measure_between_points(height_pair, label=f"{label_prefix} height"),
        ]

    def compute_floor_area(
        self,
        floor_mask: np.ndarray,
    ) -> CalibratedDimension:
        """Estimate the floor area from a binary floor mask.

        Integrates the depth-adjusted pixel areas across the floor mask
        to produce a total area in square millimetres (reported in sqm).

        Parameters
        ----------
        floor_mask:
            Binary mask (H x W) where ``True`` = floor pixel.

        Returns
        -------
        CalibratedDimension
            Floor area with ``value_mm`` in mm^2 (use ``value_m`` for m^2).
        """
        if not self.is_calibrated:
            raise RuntimeError("Converter must be calibrated before measuring.")

        assert self._calibration is not None
        cal = self._calibration

        if floor_mask.shape != (self._height, self._width):
            floor_mask = cv2.resize(
                floor_mask.astype(np.uint8),
                (self._width, self._height),
                interpolation=cv2.INTER_NEAREST,
            ).astype(bool)

        # For each floor pixel, compute its real-world area
        # Area scales with the square of the depth correction
        floor_depths = self._depth[floor_mask]
        if len(floor_depths) == 0:
            return CalibratedDimension(
                label="floor area",
                value_mm=0.0,
                confidence=MeasurementConfidence.LOW,
                method="single_view_depth",
            )

        # Per-pixel area in mm^2
        pixel_area_mm2 = cal.scale_mm_per_pixel ** 2

        # Depth correction per pixel
        ref_depth = cal.reference_depth
        if ref_depth > 0:
            corrections = (ref_depth / np.maximum(floor_depths, 1e-6)) ** 2
        else:
            corrections = np.ones_like(floor_depths)

        total_area_mm2 = float(np.sum(corrections) * pixel_area_mm2)

        return CalibratedDimension(
            label="floor area",
            value_mm=total_area_mm2,  # Note: mm^2, use value_mm / 1e6 for m^2
            confidence=cal.confidence,
            uncertainty_mm=total_area_mm2 * 0.10,  # 10% uncertainty
            method="single_view_depth",
        )
