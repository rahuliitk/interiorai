"""
OpenLintel Measurement — real-world dimensions from images.

Converts relative depth maps into calibrated metric measurements using
known reference objects (doors, A4 paper, standard bricks, etc.) and
optional multi-view stereo reconstruction via COLMAP.

Typical usage::

    from openlintel_measurement import MeasurementEstimator, CalibrationDB

    estimator = MeasurementEstimator()
    result = estimator.estimate(
        depth_array=depth_map,
        reference_object="door",
        reference_bbox=BoundingBox(x_min=100, y_min=50, x_max=200, y_max=500),
    )
    print(result.calibrated_dimensions)
"""

from openlintel_measurement.calibration import CalibrationDB, ReferenceObject
from openlintel_measurement.depth_to_metric import DepthToMetricConverter
from openlintel_measurement.estimator import MeasurementEstimator
from openlintel_measurement.schemas import CalibratedDimension, MeasurementResult

__all__ = [
    "MeasurementEstimator",
    "CalibrationDB",
    "ReferenceObject",
    "DepthToMetricConverter",
    "CalibratedDimension",
    "MeasurementResult",
]
