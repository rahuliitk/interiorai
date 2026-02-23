"""
Pydantic schemas for floor plan digitization.

All coordinates and dimensions are in **millimetres** — the canonical
internal unit.  The coordinate system origin is the bottom-left corner
of the floor plan (standard CAD convention, Y-up).
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field


class DoorWindowType(str, Enum):
    """Types of door and window openings."""

    SINGLE_DOOR = "single_door"
    DOUBLE_DOOR = "double_door"
    SLIDING_DOOR = "sliding_door"
    POCKET_DOOR = "pocket_door"
    FRENCH_DOOR = "french_door"
    BIFOLD_DOOR = "bifold_door"
    ENTRANCE_DOOR = "entrance_door"
    SINGLE_WINDOW = "single_window"
    DOUBLE_WINDOW = "double_window"
    BAY_WINDOW = "bay_window"
    SLIDING_WINDOW = "sliding_window"
    CASEMENT_WINDOW = "casement_window"
    FIXED_WINDOW = "fixed_window"
    SKYLIGHT = "skylight"


class WallType(str, Enum):
    """Wall construction types."""

    EXTERIOR = "exterior"
    INTERIOR_LOAD_BEARING = "interior_load_bearing"
    INTERIOR_PARTITION = "interior_partition"
    HALF_WALL = "half_wall"
    RAILING = "railing"


class Point2D(BaseModel):
    """A 2D point in millimetres."""

    x: float = Field(description="X coordinate in mm")
    y: float = Field(description="Y coordinate in mm")


class WallSegment(BaseModel):
    """A single wall segment defined by its start and end points."""

    id: str = Field(description="Unique wall segment identifier")
    start: Point2D = Field(description="Start point of the wall centre-line")
    end: Point2D = Field(description="End point of the wall centre-line")
    thickness_mm: float = Field(
        default=150.0,
        description="Wall thickness in mm",
    )
    wall_type: WallType = Field(
        default=WallType.INTERIOR_PARTITION,
        description="Construction type of the wall",
    )
    height_mm: float = Field(
        default=2700.0,
        description="Wall height in mm (for 3D/BOM purposes)",
    )

    @property
    def length_mm(self) -> float:
        """Computed length of the wall segment."""
        dx = self.end.x - self.start.x
        dy = self.end.y - self.start.y
        return (dx**2 + dy**2) ** 0.5

    @property
    def midpoint(self) -> Point2D:
        """Centre point of the wall."""
        return Point2D(
            x=(self.start.x + self.end.x) / 2,
            y=(self.start.y + self.end.y) / 2,
        )


class DoorWindow(BaseModel):
    """A door or window opening in a wall."""

    id: str = Field(description="Unique opening identifier")
    type: DoorWindowType = Field(description="Type of opening")
    wall_id: str = Field(description="ID of the wall this opening is in")

    # Position along the wall (distance from wall start point)
    position_along_wall_mm: float = Field(
        description="Distance from wall start to opening centre in mm"
    )
    width_mm: float = Field(description="Opening width in mm")
    height_mm: float = Field(
        default=2100.0,
        description="Opening height in mm",
    )
    sill_height_mm: float = Field(
        default=0.0,
        description="Height of sill above floor in mm (0 for doors)",
    )

    # Opening direction (for doors)
    swing_direction: str | None = Field(
        default=None,
        description="Door swing direction: 'left', 'right', 'inward', 'outward'",
    )

    @property
    def is_door(self) -> bool:
        return self.type.value.endswith("_door") or self.type == DoorWindowType.ENTRANCE_DOOR

    @property
    def is_window(self) -> bool:
        return not self.is_door


class RoomPolygon(BaseModel):
    """A room defined by a closed polygon of vertices."""

    id: str = Field(description="Unique room identifier")
    name: str = Field(description="Room name (e.g. 'Master Bedroom')")
    room_type: str = Field(
        default="other",
        description="Room type slug (living_room, bedroom, kitchen, etc.)",
    )

    # Vertices defining the room boundary (closed polygon, ordered CCW)
    vertices: list[Point2D] = Field(
        min_length=3,
        description="Polygon vertices in mm, counter-clockwise order",
    )

    # Associated wall segments
    wall_ids: list[str] = Field(
        default_factory=list,
        description="IDs of walls forming this room's boundary",
    )

    # Floor level
    floor_level: int = Field(
        default=0,
        description="Floor level (0 = ground floor)",
    )

    @property
    def num_vertices(self) -> int:
        return len(self.vertices)

    @property
    def area_sqmm(self) -> float:
        """Compute area using the Shoelace formula (sq mm)."""
        n = len(self.vertices)
        if n < 3:
            return 0.0
        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += self.vertices[i].x * self.vertices[j].y
            area -= self.vertices[j].x * self.vertices[i].y
        return abs(area) / 2.0

    @property
    def area_sqm(self) -> float:
        """Area in square metres."""
        return self.area_sqmm / 1_000_000.0

    @property
    def centroid(self) -> Point2D:
        """Geometric centroid of the polygon."""
        n = len(self.vertices)
        cx = sum(v.x for v in self.vertices) / n
        cy = sum(v.y for v in self.vertices) / n
        return Point2D(x=cx, y=cy)


class DimensionAnnotation(BaseModel):
    """A dimension annotation for the drawing."""

    start: Point2D = Field(description="Start point of the dimension line")
    end: Point2D = Field(description="End point of the dimension line")
    value_mm: float = Field(description="The dimension value in mm")
    label: str = Field(
        default="",
        description="Optional label text (if different from value)",
    )
    offset_mm: float = Field(
        default=300.0,
        description="Offset distance of the dimension line from the measured element",
    )


class FloorPlanData(BaseModel):
    """Complete structured representation of a floor plan.

    This is the canonical interchange format between the VLM extractor,
    the DXF generator, and downstream services.
    """

    # Metadata
    project_name: str = Field(default="Untitled", description="Project or plan name")
    scale: float = Field(
        default=1.0,
        description="Drawing scale factor (1.0 = 1:1, 0.01 = 1:100)",
    )
    unit: str = Field(default="mm", description="Drawing unit (always 'mm' internally)")

    # Structural elements
    walls: list[WallSegment] = Field(default_factory=list, description="All wall segments")
    rooms: list[RoomPolygon] = Field(default_factory=list, description="All room polygons")
    openings: list[DoorWindow] = Field(default_factory=list, description="All doors and windows")
    dimensions: list[DimensionAnnotation] = Field(
        default_factory=list,
        description="Dimension annotations",
    )

    # Source metadata
    source_type: str = Field(
        default="raster",
        description="Source format: 'raster', 'dwg', 'dxf', 'pdf'",
    )
    source_resolution_dpi: int | None = Field(
        default=None,
        description="Source image DPI (for raster sources)",
    )

    @property
    def total_area_sqm(self) -> float:
        """Sum of all room areas in square metres."""
        return sum(r.area_sqm for r in self.rooms)

    @property
    def wall_count(self) -> int:
        return len(self.walls)

    @property
    def room_count(self) -> int:
        return len(self.rooms)

    @property
    def opening_count(self) -> int:
        return len(self.openings)

    def doors(self) -> list[DoorWindow]:
        """Return only door openings."""
        return [o for o in self.openings if o.is_door]

    def windows(self) -> list[DoorWindow]:
        """Return only window openings."""
        return [o for o in self.openings if o.is_window]

    def get_room(self, room_id: str) -> RoomPolygon | None:
        """Look up a room by ID."""
        for room in self.rooms:
            if room.id == room_id:
                return room
        return None

    def get_wall(self, wall_id: str) -> WallSegment | None:
        """Look up a wall segment by ID."""
        for wall in self.walls:
            if wall.id == wall_id:
                return wall
        return None
