"""
Pydantic schemas for room segmentation pipeline outputs.

All coordinates use **pixel space** relative to the input image unless
explicitly noted.  Dimensions in millimetres are only available when a
calibration reference has been provided.
"""

from __future__ import annotations

from enum import Enum

import numpy as np
from pydantic import BaseModel, Field


class ObjectCategory(str, Enum):
    """Broad categories for detected room elements."""

    WALL = "wall"
    FLOOR = "floor"
    CEILING = "ceiling"
    WINDOW = "window"
    DOOR = "door"
    COLUMN = "column"
    BEAM = "beam"
    FURNITURE = "furniture"
    APPLIANCE = "appliance"
    FIXTURE = "fixture"
    TEXTILE = "textile"
    DECOR = "decor"
    LIGHTING = "lighting"
    OUTLET = "outlet"
    SWITCH = "switch"
    OTHER = "other"


class BoundingBox(BaseModel):
    """Axis-aligned bounding box in pixel coordinates.

    Origin is the top-left corner of the image.
    """

    x_min: int = Field(ge=0, description="Left edge x-coordinate in pixels")
    y_min: int = Field(ge=0, description="Top edge y-coordinate in pixels")
    x_max: int = Field(ge=0, description="Right edge x-coordinate in pixels")
    y_max: int = Field(ge=0, description="Bottom edge y-coordinate in pixels")

    @property
    def width(self) -> int:
        return self.x_max - self.x_min

    @property
    def height(self) -> int:
        return self.y_max - self.y_min

    @property
    def area(self) -> int:
        return self.width * self.height

    @property
    def center(self) -> tuple[int, int]:
        return ((self.x_min + self.x_max) // 2, (self.y_min + self.y_max) // 2)


class DetectedObject(BaseModel):
    """A single detected room element with segmentation data."""

    id: int = Field(description="Unique object index within this result")
    label: str = Field(description="Human-readable label (e.g. 'leather sofa')")
    category: ObjectCategory = Field(description="Broad category classification")
    confidence: float = Field(ge=0.0, le=1.0, description="Detection confidence score")
    bbox: BoundingBox = Field(description="Axis-aligned bounding box")

    # SAM 2 mask — stored as a run-length encoding for serialisation
    mask_rle: dict | None = Field(
        default=None,
        description="Run-length encoded binary mask from SAM 2",
    )

    # Depth statistics within the mask
    depth_mean: float | None = Field(
        default=None,
        description="Mean relative depth value within the mask (0=near, 1=far)",
    )
    depth_median: float | None = Field(
        default=None,
        description="Median relative depth value within the mask",
    )

    # Material and colour (from VLM)
    detected_material: str | None = Field(
        default=None,
        description="VLM-detected material (e.g. 'oak wood', 'marble')",
    )
    detected_color: str | None = Field(
        default=None,
        description="Dominant colour description",
    )

    model_config = {"arbitrary_types_allowed": True}


class DepthMap(BaseModel):
    """Container for a monocular depth estimation result.

    The raw depth values are relative (inverse depth) and must be
    calibrated via a reference object to yield metric measurements.
    """

    width: int = Field(description="Depth map width in pixels")
    height: int = Field(description="Depth map height in pixels")
    min_depth: float = Field(description="Minimum relative depth value")
    max_depth: float = Field(description="Maximum relative depth value")
    mean_depth: float = Field(description="Mean relative depth value")

    # The actual depth array is stored externally (e.g. as .npy or .npz)
    # and referenced by path or kept in memory.  We store metadata here.
    storage_path: str | None = Field(
        default=None,
        description="Path to the stored depth array (.npy file)",
    )

    model_config = {"arbitrary_types_allowed": True}


class SegmentationResult(BaseModel):
    """Complete output of the room segmentation pipeline."""

    image_width: int = Field(description="Original image width in pixels")
    image_height: int = Field(description="Original image height in pixels")

    objects: list[DetectedObject] = Field(
        default_factory=list,
        description="All detected and segmented objects",
    )

    depth_map: DepthMap | None = Field(
        default=None,
        description="Monocular depth estimation result",
    )

    # Room-level metadata from VLM
    detected_room_type: str | None = Field(
        default=None,
        description="VLM-detected room type",
    )
    natural_light_direction: str | None = Field(
        default=None,
        description="Estimated natural light direction (N/S/E/W/...)",
    )

    @property
    def object_count(self) -> int:
        return len(self.objects)

    def objects_by_category(self, category: ObjectCategory) -> list[DetectedObject]:
        """Filter detected objects by category."""
        return [obj for obj in self.objects if obj.category == category]

    def furniture_objects(self) -> list[DetectedObject]:
        """Return only furniture-type objects."""
        return self.objects_by_category(ObjectCategory.FURNITURE)

    def structural_objects(self) -> list[DetectedObject]:
        """Return structural elements (walls, floor, ceiling, columns, beams)."""
        structural = {
            ObjectCategory.WALL,
            ObjectCategory.FLOOR,
            ObjectCategory.CEILING,
            ObjectCategory.COLUMN,
            ObjectCategory.BEAM,
        }
        return [obj for obj in self.objects if obj.category in structural]


def mask_to_rle(mask: np.ndarray) -> dict:
    """Convert a binary numpy mask to run-length encoding.

    Parameters
    ----------
    mask:
        2D boolean or uint8 numpy array.

    Returns
    -------
    dict
        ``{"counts": [...], "size": [height, width]}`` compatible with
        COCO RLE format.
    """
    flat = mask.flatten(order="F").astype(np.uint8)
    counts: list[int] = []
    current = flat[0]
    count = 0

    for val in flat:
        if val == current:
            count += 1
        else:
            counts.append(count)
            count = 1
            current = val
    counts.append(count)

    # Ensure counts start with a zero-run if the mask starts with 1
    if flat[0] == 1:
        counts.insert(0, 0)

    return {"counts": counts, "size": [mask.shape[0], mask.shape[1]]}


def rle_to_mask(rle: dict) -> np.ndarray:
    """Decode a run-length encoding back to a binary numpy mask.

    Parameters
    ----------
    rle:
        ``{"counts": [...], "size": [height, width]}`` dict.

    Returns
    -------
    np.ndarray
        2D boolean array of shape ``(height, width)``.
    """
    h, w = rle["size"]
    counts = rle["counts"]
    flat = np.zeros(h * w, dtype=np.uint8)

    pos = 0
    for i, count in enumerate(counts):
        if i % 2 == 1:  # Odd indices are foreground runs
            flat[pos : pos + count] = 1
        pos += count

    return flat.reshape((h, w), order="F").astype(bool)
