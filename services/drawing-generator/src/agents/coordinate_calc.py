"""
Coordinate calculation engine for wall geometry and furniture placement.

Converts room dimensions and design data into precise 2D coordinates for
drawing generation.  Handles wall offsets, door/window openings, and
furniture placement within the room boundary.
"""

from __future__ import annotations

import math
from typing import Any

import structlog

from src.models.drawings import (
    ElectricalPoint,
    FurnitureItem,
    Point2D,
    WallSegment,
    WallType,
)

logger = structlog.get_logger(__name__)


def generate_wall_coordinates(
    length_mm: float,
    width_mm: float,
    wall_thickness_mm: float = 150.0,
    doors: list[dict[str, Any]] | None = None,
    windows: list[dict[str, Any]] | None = None,
) -> list[WallSegment]:
    """Generate wall segments for a rectangular room.

    Walls are numbered clockwise from the bottom (south):
    - Wall 0: South (bottom)
    - Wall 1: East (right)
    - Wall 2: North (top)
    - Wall 3: West (left)

    Parameters
    ----------
    length_mm:
        Room length (x-direction) in mm.
    width_mm:
        Room width (y-direction) in mm.
    wall_thickness_mm:
        Default wall thickness.
    doors:
        Optional list of door specifications: ``[{"wall": 0, "offset_mm": ..., "width_mm": ...}]``
    windows:
        Optional list of window specifications with wall index, offset, dimensions.

    Returns
    -------
    list[WallSegment]
        Four wall segments forming the room boundary.
    """
    doors = doors or []
    windows = windows or []

    # Build door/window lookup by wall index
    door_by_wall: dict[int, dict[str, Any]] = {}
    for d in doors:
        wall_idx = d.get("wall", 0)
        door_by_wall[wall_idx] = d

    window_by_wall: dict[int, dict[str, Any]] = {}
    for w in windows:
        wall_idx = w.get("wall", 2)
        window_by_wall[wall_idx] = w

    # Define wall corners (inner face, clockwise)
    corners = [
        Point2D(x=0, y=0),              # SW (origin)
        Point2D(x=length_mm, y=0),      # SE
        Point2D(x=length_mm, y=width_mm),  # NE
        Point2D(x=0, y=width_mm),       # NW
    ]

    walls: list[WallSegment] = []
    wall_pairs = [(0, 1), (1, 2), (2, 3), (3, 0)]

    for idx, (start_idx, end_idx) in enumerate(wall_pairs):
        door_info = door_by_wall.get(idx)
        window_info = window_by_wall.get(idx)

        has_door = door_info is not None
        has_window = window_info is not None

        # Default door at centre of wall if no offset specified
        wall_length = _distance(corners[start_idx], corners[end_idx])
        door_width = door_info.get("width_mm", 900.0) if door_info else 900.0
        door_offset = (
            door_info.get("offset_mm", (wall_length - door_width) / 2)
            if door_info
            else (wall_length - door_width) / 2
        )

        window_width = window_info.get("width_mm", 1200.0) if window_info else 1200.0
        window_height = window_info.get("height_mm", 1200.0) if window_info else 1200.0
        window_sill = window_info.get("sill_mm", 900.0) if window_info else 900.0
        window_offset = (
            window_info.get("offset_mm", (wall_length - window_width) / 2)
            if window_info
            else (wall_length - window_width) / 2
        )

        wall_type = WallType.EXTERNAL if idx in (0, 2) else WallType.INTERNAL

        segment = WallSegment(
            start=corners[start_idx],
            end=corners[end_idx],
            thickness_mm=wall_thickness_mm,
            wall_type=wall_type,
            has_door=has_door,
            has_window=has_window,
            door_width_mm=door_width,
            door_offset_mm=door_offset,
            window_width_mm=window_width,
            window_height_mm=window_height,
            window_sill_mm=window_sill,
            window_offset_mm=window_offset,
        )
        walls.append(segment)

    return walls


def place_furniture_in_room(
    length_mm: float,
    width_mm: float,
    furniture_specs: list[dict[str, Any]],
    wall_thickness_mm: float = 150.0,
) -> list[FurnitureItem]:
    """Calculate furniture placement positions within the room.

    Uses a simple gravity-based placement along walls with collision avoidance.

    Parameters
    ----------
    length_mm:
        Room length in mm.
    width_mm:
        Room width in mm.
    furniture_specs:
        List of furniture dicts with ``name``, ``type``, ``width_mm``,
        ``depth_mm``, and optionally ``height_mm`` and ``preferred_wall``.
    wall_thickness_mm:
        Wall thickness for inner offset calculation.

    Returns
    -------
    list[FurnitureItem]
        Furniture items with computed positions.
    """
    placed: list[FurnitureItem] = []
    occupied_zones: list[tuple[float, float, float, float]] = []

    # Usable interior dimensions
    inner_x = wall_thickness_mm
    inner_y = wall_thickness_mm
    inner_w = length_mm - 2 * wall_thickness_mm
    inner_h = width_mm - 2 * wall_thickness_mm

    # Sort by area (largest first) for better packing
    sorted_specs = sorted(
        furniture_specs,
        key=lambda f: f.get("width_mm", 0) * f.get("depth_mm", 0),
        reverse=True,
    )

    for idx, spec in enumerate(sorted_specs):
        fw = float(spec.get("width_mm", 600))
        fd = float(spec.get("depth_mm", 450))
        fh = float(spec.get("height_mm", 750))
        ftype = spec.get("type", "generic")
        fname = spec.get("name", f"Furniture_{idx}")
        preferred_wall = spec.get("preferred_wall")

        position, rotation = _find_placement(
            furniture_width=fw,
            furniture_depth=fd,
            room_inner_x=inner_x,
            room_inner_y=inner_y,
            room_inner_w=inner_w,
            room_inner_h=inner_h,
            occupied=occupied_zones,
            preferred_wall=preferred_wall,
            furniture_type=ftype,
        )

        item = FurnitureItem(
            id=spec.get("id", f"furn_{idx}"),
            name=fname,
            type=ftype,
            position=Point2D(x=position[0], y=position[1]),
            width_mm=fw,
            depth_mm=fd,
            height_mm=fh,
            rotation_deg=rotation,
        )
        placed.append(item)

        # Mark occupied zone (axis-aligned bounding box)
        if rotation in (90, 270):
            occupied_zones.append((position[0], position[1], fd, fw))
        else:
            occupied_zones.append((position[0], position[1], fw, fd))

    return placed


def generate_electrical_layout(
    length_mm: float,
    width_mm: float,
    room_type: str,
    furniture: list[FurnitureItem] | None = None,
) -> list[ElectricalPoint]:
    """Generate standard electrical point positions for a room.

    Parameters
    ----------
    length_mm:
        Room length in mm.
    width_mm:
        Room width in mm.
    room_type:
        Room type string for context-sensitive placement.
    furniture:
        Optional placed furniture for switch positioning.

    Returns
    -------
    list[ElectricalPoint]
        Electrical points with positions.
    """
    points: list[ElectricalPoint] = []
    idx = 0

    # Main light (centre of room)
    points.append(ElectricalPoint(
        id=f"elec_{idx}",
        type="light",
        position=Point2D(x=length_mm / 2, y=width_mm / 2),
        height_mm=2700,
        symbol="LIGHT_CEILING",
        circuit="lighting",
    ))
    idx += 1

    # Main switch near the door (assumed bottom-left)
    points.append(ElectricalPoint(
        id=f"elec_{idx}",
        type="switch",
        position=Point2D(x=200, y=200),
        height_mm=1200,
        symbol="SWITCH_1G",
        circuit="lighting",
    ))
    idx += 1

    # Corner sockets
    socket_positions = [
        (300, 300),
        (length_mm - 300, 300),
        (length_mm - 300, width_mm - 300),
        (300, width_mm - 300),
    ]
    for sx, sy in socket_positions:
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="socket",
            position=Point2D(x=sx, y=sy),
            height_mm=300,
            symbol="SOCKET_2P",
            circuit="power",
        ))
        idx += 1

    # Room-specific additions
    if room_type in ("bedroom", "living_room"):
        # Additional bedside / table lamp sockets
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="socket",
            position=Point2D(x=length_mm / 2, y=width_mm - 300),
            height_mm=300,
            symbol="SOCKET_2P",
            circuit="power",
        ))
        idx += 1

        # AC point
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="ac",
            position=Point2D(x=length_mm / 2, y=width_mm - 100),
            height_mm=2100,
            symbol="AC_SPLIT",
            circuit="ac",
        ))
        idx += 1

    if room_type == "kitchen":
        # Exhaust fan
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="exhaust",
            position=Point2D(x=length_mm - 200, y=width_mm - 200),
            height_mm=2400,
            symbol="FAN_EXHAUST",
            circuit="ventilation",
        ))
        idx += 1

        # Under-cabinet light
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="light",
            position=Point2D(x=length_mm / 2, y=width_mm - 600),
            height_mm=1500,
            symbol="LIGHT_STRIP",
            circuit="lighting",
        ))
        idx += 1

    if room_type == "bathroom":
        # Mirror light
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="light",
            position=Point2D(x=length_mm / 2, y=width_mm - 300),
            height_mm=1800,
            symbol="LIGHT_MIRROR",
            circuit="lighting",
        ))
        idx += 1

        # Geyser point
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="socket",
            position=Point2D(x=200, y=width_mm - 200),
            height_mm=1800,
            symbol="SOCKET_GEYSER",
            circuit="geyser",
        ))
        idx += 1

    # Fan (centre)
    if room_type in ("bedroom", "living_room", "dining", "study"):
        points.append(ElectricalPoint(
            id=f"elec_{idx}",
            type="fan",
            position=Point2D(x=length_mm / 2, y=width_mm / 2),
            height_mm=2700,
            symbol="FAN_CEILING",
            circuit="fan",
        ))
        idx += 1

    return points


# -- Private helpers --------------------------------------------------------

def _distance(a: Point2D, b: Point2D) -> float:
    """Euclidean distance between two points."""
    return math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)


def _find_placement(
    furniture_width: float,
    furniture_depth: float,
    room_inner_x: float,
    room_inner_y: float,
    room_inner_w: float,
    room_inner_h: float,
    occupied: list[tuple[float, float, float, float]],
    preferred_wall: str | None = None,
    furniture_type: str = "generic",
) -> tuple[tuple[float, float], float]:
    """Find a valid placement position for a furniture item.

    Tries preferred wall first, then other walls, then centre.
    Returns ``((x, y), rotation_deg)``.
    """
    wall_placements = {
        "south": (room_inner_x, room_inner_y, 0),
        "east": (room_inner_x + room_inner_w - furniture_depth, room_inner_y, 90),
        "north": (room_inner_x, room_inner_y + room_inner_h - furniture_depth, 0),
        "west": (room_inner_x, room_inner_y, 90),
    }

    # Determine wall order
    wall_order: list[str]
    if preferred_wall and preferred_wall in wall_placements:
        wall_order = [preferred_wall] + [w for w in wall_placements if w != preferred_wall]
    else:
        # Default placement strategy by furniture type
        type_wall_map: dict[str, str] = {
            "wardrobe": "north",
            "bed": "north",
            "sofa": "south",
            "desk": "east",
            "dining_table": "south",
            "tv_unit": "north",
            "dressing_table": "east",
            "bookshelf": "west",
            "shoe_rack": "south",
        }
        first_wall = type_wall_map.get(furniture_type, "north")
        wall_order = [first_wall] + [w for w in wall_placements if w != first_wall]

    # Try each wall
    for wall_name in wall_order:
        base_x, base_y, rotation = wall_placements[wall_name]

        # Try positions along this wall
        if rotation in (90, 270):
            eff_w, eff_d = furniture_depth, furniture_width
        else:
            eff_w, eff_d = furniture_width, furniture_depth

        # Slide along the wall to find a free slot
        if wall_name in ("south", "north"):
            for offset in range(0, int(room_inner_w - eff_w) + 1, 50):
                pos = (room_inner_x + offset, base_y)
                if not _overlaps(pos[0], pos[1], eff_w, eff_d, occupied):
                    return pos, rotation
        else:
            for offset in range(0, int(room_inner_h - eff_d) + 1, 50):
                pos = (base_x, room_inner_y + offset)
                if not _overlaps(pos[0], pos[1], eff_w, eff_d, occupied):
                    return pos, rotation

    # Fallback: centre of room
    cx = room_inner_x + (room_inner_w - furniture_width) / 2
    cy = room_inner_y + (room_inner_h - furniture_depth) / 2
    return (cx, cy), 0


def _overlaps(
    x: float,
    y: float,
    w: float,
    h: float,
    occupied: list[tuple[float, float, float, float]],
    margin: float = 50.0,
) -> bool:
    """Check if a rectangle overlaps any occupied zone."""
    for ox, oy, ow, oh in occupied:
        if (
            x < ox + ow + margin
            and x + w + margin > ox
            and y < oy + oh + margin
            and y + h + margin > oy
        ):
            return True
    return False
