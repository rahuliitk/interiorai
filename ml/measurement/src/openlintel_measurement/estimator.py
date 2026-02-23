"""
High-level measurement estimator.

Combines depth maps, reference-object calibration, and optional multi-view
stereo to produce calibrated real-world dimensions for room elements.

This is the primary entry point for services that need measurements.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

from openlintel_measurement.calibration import CalibrationDB
from openlintel_measurement.depth_to_metric import DepthToMetricConverter
from openlintel_measurement.schemas import (
    CalibratedDimension,
    CalibrationInfo,
    MeasurementConfidence,
    MeasurementResult,
    PointPair,
    RoomDimensions,
)

logger = logging.getLogger(__name__)


class MeasurementEstimator:
    """High-level estimator for real-world room measurements.

    Wraps ``DepthToMetricConverter`` with a convenient API that accepts
    detected objects and produces complete measurement results.

    Usage::

        estimator = MeasurementEstimator()
        result = estimator.estimate(
            depth_array=depth_map,
            reference_object="door",
            reference_bbox=(100, 50, 200, 500),
        )
        for dim in result.dimensions:
            print(f"{dim.label}: {dim.value_mm:.0f} mm")
    """

    def estimate(
        self,
        depth_array: np.ndarray,
        reference_object: str,
        reference_bbox: tuple[int, int, int, int],
        *,
        measurement_requests: list[dict[str, Any]] | None = None,
        floor_mask: np.ndarray | None = None,
        image_width: int = 0,
        image_height: int = 0,
    ) -> MeasurementResult:
        """Run a complete measurement estimation.

        Parameters
        ----------
        depth_array:
            Normalised relative depth map (H x W, float32, 0..1).
        reference_object:
            Slug of the reference object for calibration (e.g. ``"door"``).
        reference_bbox:
            ``(x_min, y_min, x_max, y_max)`` bounding box of the reference
            object in pixel coordinates.
        measurement_requests:
            Optional list of measurement requests, each a dict with:
            - ``"type"``: ``"point_pair"`` or ``"bbox"``
            - ``"label"``: Human-readable label
            - For point_pair: ``"x1"``, ``"y1"``, ``"x2"``, ``"y2"``
            - For bbox: ``"x_min"``, ``"y_min"``, ``"x_max"``, ``"y_max"``
        floor_mask:
            Optional binary mask (H x W) of floor pixels for area estimation.
        image_width:
            Original image width in pixels.
        image_height:
            Original image height in pixels.

        Returns
        -------
        MeasurementResult
            Complete measurement output.
        """
        converter = DepthToMetricConverter(depth_array)
        x_min, y_min, x_max, y_max = reference_bbox

        # Calibrate
        calibration_info = converter.calibrate(
            reference_slug=reference_object,
            bbox_x_min=x_min,
            bbox_y_min=y_min,
            bbox_x_max=x_max,
            bbox_y_max=y_max,
        )

        dimensions: list[CalibratedDimension] = []

        # Process measurement requests
        if measurement_requests:
            for req in measurement_requests:
                req_type = req.get("type", "point_pair")
                label = req.get("label", "measurement")

                try:
                    if req_type == "point_pair":
                        pp = PointPair(
                            x1=req["x1"], y1=req["y1"],
                            x2=req["x2"], y2=req["y2"],
                        )
                        dim = converter.measure_between_points(pp, label=label)
                        dimensions.append(dim)

                    elif req_type == "bbox":
                        bbox_dims = converter.measure_bbox_dimensions(
                            bbox_x_min=req["x_min"],
                            bbox_y_min=req["y_min"],
                            bbox_x_max=req["x_max"],
                            bbox_y_max=req["y_max"],
                            label_prefix=label,
                        )
                        dimensions.extend(bbox_dims)

                except Exception as exc:
                    logger.warning("Measurement request failed for '%s': %s", label, exc)

        # Estimate floor area if mask provided
        if floor_mask is not None:
            try:
                floor_dim = converter.compute_floor_area(floor_mask)
                dimensions.append(floor_dim)
            except Exception as exc:
                logger.warning("Floor area estimation failed: %s", exc)

        # Attempt room dimension estimation
        room_dims = self._estimate_room_dimensions(converter, depth_array, floor_mask)

        return MeasurementResult(
            calibration=calibration_info,
            dimensions=dimensions,
            room_dimensions=room_dims,
            image_width=image_width or depth_array.shape[1],
            image_height=image_height or depth_array.shape[0],
        )

    def estimate_objects(
        self,
        depth_array: np.ndarray,
        reference_object: str,
        reference_bbox: tuple[int, int, int, int],
        objects: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Measure dimensions for a list of detected objects.

        Each object dict should have a ``"bbox"`` key with
        ``(x_min, y_min, x_max, y_max)`` and an optional ``"label"`` key.

        Returns the same objects with an added ``"dimensions_mm"`` key
        containing ``{"width": ..., "height": ...}``.

        Parameters
        ----------
        depth_array:
            Normalised relative depth map.
        reference_object:
            Reference object slug for calibration.
        reference_bbox:
            Bounding box of the reference object.
        objects:
            List of object dicts with ``"bbox"`` and optional ``"label"``.

        Returns
        -------
        list[dict]
            Objects enriched with ``"dimensions_mm"`` measurements.
        """
        converter = DepthToMetricConverter(depth_array)
        x_min, y_min, x_max, y_max = reference_bbox
        converter.calibrate(
            reference_slug=reference_object,
            bbox_x_min=x_min,
            bbox_y_min=y_min,
            bbox_x_max=x_max,
            bbox_y_max=y_max,
        )

        enriched: list[dict[str, Any]] = []
        for obj in objects:
            obj_copy = dict(obj)
            bbox = obj.get("bbox")
            label = obj.get("label", "object")

            if bbox and len(bbox) == 4:
                try:
                    dims = converter.measure_bbox_dimensions(
                        bbox_x_min=bbox[0],
                        bbox_y_min=bbox[1],
                        bbox_x_max=bbox[2],
                        bbox_y_max=bbox[3],
                        label_prefix=label,
                    )
                    obj_copy["dimensions_mm"] = {
                        "width": dims[0].value_mm,
                        "height": dims[1].value_mm,
                        "width_confidence": dims[0].confidence.value,
                        "height_confidence": dims[1].confidence.value,
                    }
                except Exception as exc:
                    logger.warning(
                        "Measurement failed for object '%s': %s", label, exc
                    )

            enriched.append(obj_copy)

        return enriched

    @staticmethod
    def _estimate_room_dimensions(
        converter: DepthToMetricConverter,
        depth_array: np.ndarray,
        floor_mask: np.ndarray | None,
    ) -> RoomDimensions | None:
        """Attempt to estimate overall room dimensions from depth data.

        This is a rough heuristic: we measure the extent of the depth
        map in the horizontal and vertical directions and convert to
        metric using the calibrated scale.
        """
        if not converter.is_calibrated:
            return None

        h, w = depth_array.shape

        try:
            # Estimate room width: horizontal extent at floor level
            width_pair = PointPair(x1=0, y1=h - 1, x2=w - 1, y2=h - 1)
            width_dim = converter.measure_between_points(
                width_pair, label="room width estimate"
            )

            # Estimate room height: vertical extent at image center
            height_pair = PointPair(x1=w // 2, y1=0, x2=w // 2, y2=h - 1)
            height_dim = converter.measure_between_points(
                height_pair, label="room height estimate"
            )

            # Estimate room depth from the depth range
            depth_range = float(np.max(depth_array) - np.min(depth_array))
            if depth_range > 0 and converter._calibration is not None:
                cal = converter._calibration
                # Very rough estimate based on depth extent
                depth_mm = (
                    depth_range * cal.scale_mm_per_pixel * max(h, w) * 0.5
                )
            else:
                depth_mm = width_dim.value_mm  # Assume roughly square

            room_width = width_dim.value_mm
            room_height = height_dim.value_mm
            room_depth = depth_mm

            # Sanity bounds (room should be 1m-30m in each direction)
            for val, name in [
                (room_width, "width"),
                (room_height, "height"),
                (room_depth, "depth"),
            ]:
                if val < 1000 or val > 30000:
                    logger.warning(
                        "Room %s estimate (%.0f mm) outside sane range, skipping",
                        name,
                        val,
                    )
                    return None

            area_sqm = (room_width / 1000) * (room_depth / 1000)
            volume_cbm = area_sqm * (room_height / 1000)

            return RoomDimensions(
                length_mm=room_depth,
                width_mm=room_width,
                height_mm=room_height,
                area_sqm=area_sqm,
                volume_cbm=volume_cbm,
                confidence=MeasurementConfidence.LOW,
            )

        except Exception as exc:
            logger.warning("Room dimension estimation failed: %s", exc)
            return None
