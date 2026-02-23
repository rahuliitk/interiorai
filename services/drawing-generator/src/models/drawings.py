"""
Pydantic models for the Drawing Generator service.

Defines request/response shapes for drawing generation, retrieval, and download.
All measurements are in millimetres internally; drawings use a configurable
scale (default 1:50).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, Field

from openlintel_shared.schemas.design import DesignStyle
from openlintel_shared.schemas.room import Dimensions, RoomType


# -- Enumerations -----------------------------------------------------------

class DrawingType(str, Enum):
    """Supported drawing types."""

    FLOOR_PLAN = "floor_plan"
    FURNISHED_PLAN = "furnished_plan"
    ELEVATION = "elevation"
    SECTION = "section"
    RCP = "rcp"
    FLOORING_LAYOUT = "flooring_layout"
    ELECTRICAL_LAYOUT = "electrical_layout"


class DrawingStatus(str, Enum):
    """Processing status for a drawing generation job."""

    PENDING = "pending"
    ANALYZING = "analyzing"
    COMPUTING = "computing"
    RENDERING = "rendering"
    COMPLETE = "complete"
    FAILED = "failed"


class DrawingFormat(str, Enum):
    """Supported output formats."""

    DXF = "dxf"
    PDF = "pdf"
    SVG = "svg"


class WallType(str, Enum):
    """Types of walls."""

    EXTERNAL = "external"
    INTERNAL = "internal"
    PARTITION = "partition"


class ElevationWall(str, Enum):
    """Wall identifiers for elevation drawings."""

    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"


# -- Geometry models --------------------------------------------------------

class Point2D(BaseModel):
    """A 2D point in millimetres."""

    x: float
    y: float


class Point3D(BaseModel):
    """A 3D point in millimetres."""

    x: float
    y: float
    z: float = 0.0


class WallSegment(BaseModel):
    """A single wall segment defined by start/end points and thickness."""

    start: Point2D
    end: Point2D
    thickness_mm: float = Field(default=150.0, description="Wall thickness in mm")
    wall_type: WallType = WallType.INTERNAL
    has_door: bool = False
    has_window: bool = False
    door_width_mm: float = Field(default=900.0, description="Door opening width")
    door_offset_mm: float = Field(default=0.0, description="Door offset from start point")
    window_width_mm: float = Field(default=1200.0, description="Window width")
    window_height_mm: float = Field(default=1200.0, description="Window height")
    window_sill_mm: float = Field(default=900.0, description="Window sill height from floor")
    window_offset_mm: float = Field(default=0.0, description="Window offset from start point")


class FurnitureItem(BaseModel):
    """A furniture piece placed in the room."""

    id: str
    name: str
    type: str = Field(description="E.g. wardrobe, bed, sofa, desk, dining_table")
    position: Point2D = Field(description="Bottom-left corner position in mm")
    width_mm: float
    depth_mm: float
    height_mm: float = Field(default=750.0)
    rotation_deg: float = Field(default=0.0, description="Rotation angle in degrees")
    layer: str = Field(default="FURNITURE")


class ElectricalPoint(BaseModel):
    """An electrical fixture/point in the room."""

    id: str
    type: str = Field(description="switch, socket, light, fan, ac, exhaust")
    position: Point2D
    height_mm: float = Field(default=1200.0, description="Height from floor")
    symbol: str = Field(default="", description="CAD symbol identifier")
    circuit: str = Field(default="general", description="Circuit identifier")


class CeilingElement(BaseModel):
    """A ceiling element for RCP drawings."""

    id: str
    type: str = Field(description="cove, peripheral, island, full, bulkhead")
    outline: list[Point2D] = Field(description="Polygon outline points")
    drop_mm: float = Field(default=150.0, description="Drop from structural ceiling")
    has_light: bool = False
    light_positions: list[Point2D] = Field(default_factory=list)


class FlooringZone(BaseModel):
    """A flooring zone within the room."""

    id: str
    material: str = Field(description="Flooring material name")
    pattern: str = Field(default="straight", description="Laying pattern")
    tile_size_mm: tuple[float, float] = Field(default=(600.0, 600.0))
    outline: list[Point2D] = Field(description="Zone boundary polygon")
    start_point: Point2D | None = Field(default=None, description="Pattern start reference")


# -- Request/Response models ------------------------------------------------

class RoomInput(BaseModel):
    """Room data for drawing generation."""

    id: str
    name: str
    type: RoomType
    dimensions: Dimensions
    floor: int = 0
    walls: list[WallSegment] = Field(default_factory=list)
    furniture: list[FurnitureItem] = Field(default_factory=list)
    electrical_points: list[ElectricalPoint] = Field(default_factory=list)
    ceiling_elements: list[CeilingElement] = Field(default_factory=list)
    flooring_zones: list[FlooringZone] = Field(default_factory=list)


class DesignVariantInput(BaseModel):
    """Design variant data for drawing generation."""

    id: str
    room_id: str = Field(alias="roomId")
    name: str
    style: DesignStyle
    spec_json: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class DrawingGenerateRequest(BaseModel):
    """Request body for POST /api/v1/drawings/generate."""

    project_id: str = Field(description="Project ID")
    room: RoomInput = Field(description="Room geometry and contents")
    design_variant: DesignVariantInput = Field(
        alias="designVariant",
        description="Design variant to generate drawings for",
    )
    drawing_types: list[DrawingType] = Field(
        default=[DrawingType.FLOOR_PLAN],
        alias="drawingTypes",
        description="Types of drawings to generate",
    )
    scale: str = Field(default="1:50", description="Drawing scale (e.g. 1:50, 1:100)")
    elevation_walls: list[ElevationWall] = Field(
        default_factory=list,
        alias="elevationWalls",
        description="Which walls to generate elevations for (if elevation type requested)",
    )
    section_axis: str = Field(
        default="x",
        alias="sectionAxis",
        description="Section cut axis: x (east-west) or y (north-south)",
    )
    section_offset_mm: float = Field(
        default=0.0,
        alias="sectionOffsetMm",
        description="Section cut offset from room origin",
    )
    paper_size: str = Field(default="A3", alias="paperSize", description="Paper size for PDF output")

    model_config = {"populate_by_name": True}


class DrawingFile(BaseModel):
    """A generated drawing file."""

    drawing_type: DrawingType
    format: DrawingFormat
    filename: str
    size_bytes: int
    storage_key: str = Field(default="", description="MinIO storage key, if persisted")
    download_url: str = Field(default="", description="Presigned download URL")


class DrawingResult(BaseModel):
    """Complete result of a drawing generation job."""

    id: str = Field(description="Drawing job ID")
    project_id: str
    room_id: str
    design_variant_id: str
    status: DrawingStatus
    drawings: list[DrawingFile] = Field(default_factory=list)
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    scale: str = "1:50"


class DrawingGenerateResponse(BaseModel):
    """Response for POST /api/v1/drawings/generate."""

    drawing_id: str = Field(description="Drawing job ID for polling")
    status: DrawingStatus
    message: str
