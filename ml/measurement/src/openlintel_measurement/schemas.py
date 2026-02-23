"""
Pydantic schemas for measurement pipeline outputs.

All measurements are in **millimetres** — the canonical internal unit for
OpenLintel.  Services may convert to metres or feet for display.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class MeasurementConfidence(str, Enum):
    """Qualitative confidence level for a measurement."""

    HIGH = "high"  # Multi-view or well-calibrated single-view
    MEDIUM = "medium"  # Single-view with good reference
    LOW = "low"  # Estimated / no reference available
    UNCALIBRATED = "uncalibrated"  # Raw relative depth, no metric conversion


class CalibratedDimension(BaseModel):
    """A single real-world dimension with confidence metadata."""

    label: str = Field(description="What is being measured (e.g. 'room length', 'door width')")
    value_mm: float = Field(description="Measured value in millimetres")
    confidence: MeasurementConfidence = Field(
        description="Confidence level of this measurement"
    )
    uncertainty_mm: float | None = Field(
        default=None,
        description="Estimated measurement uncertainty (+/- mm)",
    )
    method: str = Field(
        default="single_view_depth",
        description="Measurement method used (single_view_depth, multi_view_stereo, manual)",
    )

    @property
    def value_m(self) -> float:
        """Value in metres."""
        return self.value_mm / 1000.0

    @property
    def value_cm(self) -> float:
        """Value in centimetres."""
        return self.value_mm / 10.0

    @property
    def value_ft(self) -> float:
        """Value in feet."""
        return self.value_mm / 304.8

    @property
    def value_in(self) -> float:
        """Value in inches."""
        return self.value_mm / 25.4


class PointPair(BaseModel):
    """Two pixel coordinates defining a measurement line."""

    x1: int = Field(description="Start point x-coordinate in pixels")
    y1: int = Field(description="Start point y-coordinate in pixels")
    x2: int = Field(description="End point x-coordinate in pixels")
    y2: int = Field(description="End point y-coordinate in pixels")

    @property
    def pixel_distance(self) -> float:
        """Euclidean distance in pixels."""
        return ((self.x2 - self.x1) ** 2 + (self.y2 - self.y1) ** 2) ** 0.5


class CalibrationInfo(BaseModel):
    """Calibration parameters derived from a reference object."""

    reference_object: str = Field(
        description="Name of the reference object used (e.g. 'door', 'a4_paper')"
    )
    reference_known_mm: float = Field(
        description="Known real-world dimension of the reference in mm"
    )
    reference_pixel_extent: float = Field(
        description="Measured pixel extent of the reference in the image"
    )
    scale_mm_per_pixel: float = Field(
        description="Derived scale factor: mm per pixel at reference depth"
    )
    reference_depth: float = Field(
        description="Mean relative depth at the reference object"
    )


class MeasurementResult(BaseModel):
    """Complete output of a measurement operation."""

    calibration: CalibrationInfo | None = Field(
        default=None,
        description="Calibration information (null if uncalibrated)",
    )

    dimensions: list[CalibratedDimension] = Field(
        default_factory=list,
        description="All measured dimensions",
    )

    room_dimensions: RoomDimensions | None = Field(
        default=None,
        description="Estimated room dimensions if detectable",
    )

    image_width: int = Field(default=0, description="Source image width in pixels")
    image_height: int = Field(default=0, description="Source image height in pixels")

    @property
    def is_calibrated(self) -> bool:
        return self.calibration is not None

    def get_dimension(self, label: str) -> CalibratedDimension | None:
        """Look up a dimension by label."""
        for dim in self.dimensions:
            if dim.label == label:
                return dim
        return None


class RoomDimensions(BaseModel):
    """Estimated room dimensions from depth + calibration."""

    length_mm: float = Field(description="Room length in mm")
    width_mm: float = Field(description="Room width in mm")
    height_mm: float = Field(description="Room height in mm")
    area_sqm: float = Field(description="Floor area in square metres")
    volume_cbm: float = Field(description="Room volume in cubic metres")
    confidence: MeasurementConfidence = Field(
        description="Confidence level of the room dimension estimates"
    )
