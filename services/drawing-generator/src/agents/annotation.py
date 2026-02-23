"""
Annotation engine for technical drawings.

Generates dimension lines, leader labels, room labels, furniture tags,
electrical symbols, and general notes.  All outputs are in drawing
coordinates (mm, pre-scale-factor).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from src.models.drawings import (
    ElectricalPoint,
    FurnitureItem,
    Point2D,
    WallSegment,
)


@dataclass
class DimensionLine:
    """A linear dimension annotation."""

    start: tuple[float, float]
    end: tuple[float, float]
    offset_mm: float = 300.0
    text: str = ""
    direction: str = "horizontal"  # horizontal, vertical, aligned
    layer: str = "A-ANNO-DIMS"


@dataclass
class TextLabel:
    """A text label placed at a specific position."""

    position: tuple[float, float]
    text: str
    height_mm: float = 100.0
    rotation: float = 0.0
    layer: str = "A-ANNO-NOTE"
    alignment: str = "center"


@dataclass
class LeaderNote:
    """A leader line with text annotation."""

    anchor: tuple[float, float]
    text_position: tuple[float, float]
    text: str
    layer: str = "A-ANNO-NOTE"


@dataclass
class AnnotationSet:
    """Complete set of annotations for a drawing."""

    dimensions: list[DimensionLine] = field(default_factory=list)
    labels: list[TextLabel] = field(default_factory=list)
    leaders: list[LeaderNote] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def generate_wall_dimensions(
    walls: list[WallSegment],
    offset_mm: float = 500.0,
) -> list[DimensionLine]:
    """Generate dimension lines for all wall segments.

    Creates two tiers of dimensions:
    1. Overall room dimensions (outer tier).
    2. Opening dimensions for doors and windows (inner tier).

    Parameters
    ----------
    walls:
        The wall segments of the room.
    offset_mm:
        Offset distance from the wall for dimension placement.

    Returns
    -------
    list[DimensionLine]
        Dimension lines to be drawn.
    """
    dimensions: list[DimensionLine] = []

    for idx, wall in enumerate(walls):
        sx, sy = wall.start.x, wall.start.y
        ex, ey = wall.end.x, wall.end.y

        # Determine if wall is horizontal or vertical
        is_horizontal = abs(ey - sy) < 1.0
        is_vertical = abs(ex - sx) < 1.0

        wall_length = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
        length_text = f"{wall_length:.0f}"

        if is_horizontal:
            direction = "horizontal"
            # Outer dimension
            sign = -1 if sy < 1 else 1  # Place dimension outside the room
            dim_offset = offset_mm * sign
            dimensions.append(DimensionLine(
                start=(sx, sy),
                end=(ex, ey),
                offset_mm=dim_offset,
                text=length_text,
                direction=direction,
            ))
        elif is_vertical:
            direction = "vertical"
            sign = -1 if sx < 1 else 1
            dim_offset = offset_mm * sign
            dimensions.append(DimensionLine(
                start=(sx, sy),
                end=(ex, ey),
                offset_mm=dim_offset,
                text=length_text,
                direction=direction,
            ))
        else:
            dimensions.append(DimensionLine(
                start=(sx, sy),
                end=(ex, ey),
                offset_mm=offset_mm,
                text=length_text,
                direction="aligned",
            ))

        # Door opening dimension
        if wall.has_door:
            door_start = _point_along_line(
                sx, sy, ex, ey, wall.door_offset_mm
            )
            door_end = _point_along_line(
                sx, sy, ex, ey, wall.door_offset_mm + wall.door_width_mm
            )
            dim_offset_inner = offset_mm * 0.5 * (-1 if is_horizontal and sy < 1 else 1)
            dimensions.append(DimensionLine(
                start=door_start,
                end=door_end,
                offset_mm=dim_offset_inner if is_horizontal else offset_mm * 0.5,
                text=f"{wall.door_width_mm:.0f}",
                direction=direction if (is_horizontal or is_vertical) else "aligned",
            ))

        # Window opening dimension
        if wall.has_window:
            win_start = _point_along_line(
                sx, sy, ex, ey, wall.window_offset_mm
            )
            win_end = _point_along_line(
                sx, sy, ex, ey, wall.window_offset_mm + wall.window_width_mm
            )
            dim_offset_inner = offset_mm * 0.5 * (-1 if is_horizontal and sy < 1 else 1)
            dimensions.append(DimensionLine(
                start=win_start,
                end=win_end,
                offset_mm=dim_offset_inner if is_horizontal else offset_mm * 0.5,
                text=f"{wall.window_width_mm:.0f}",
                direction=direction if (is_horizontal or is_vertical) else "aligned",
            ))

    return dimensions


def generate_room_label(
    room_name: str,
    room_type: str,
    length_mm: float,
    width_mm: float,
) -> TextLabel:
    """Generate a room name label at the centre of the room.

    Includes the room name and area in the label text.

    Parameters
    ----------
    room_name:
        Display name of the room.
    room_type:
        Room type for area calculation context.
    length_mm:
        Room length in mm.
    width_mm:
        Room width in mm.

    Returns
    -------
    TextLabel
        The room label annotation.
    """
    area_sqft = (length_mm * width_mm) / (304.8 * 304.8)
    area_sqm = (length_mm * width_mm) / 1_000_000

    text = f"{room_name}\\P{area_sqft:.0f} sqft ({area_sqm:.1f} sqm)"

    return TextLabel(
        position=(length_mm / 2, width_mm / 2),
        text=text,
        height_mm=150.0,
        layer="A-ANNO-NOTE",
        alignment="center",
    )


def generate_furniture_labels(
    furniture: list[FurnitureItem],
) -> list[TextLabel]:
    """Generate labels for each furniture item.

    Parameters
    ----------
    furniture:
        List of placed furniture items.

    Returns
    -------
    list[TextLabel]
        Labels positioned at the centre of each furniture piece.
    """
    labels: list[TextLabel] = []

    for item in furniture:
        cx = item.position.x + item.width_mm / 2
        cy = item.position.y + item.depth_mm / 2

        labels.append(TextLabel(
            position=(cx, cy),
            text=item.name.upper(),
            height_mm=80.0,
            rotation=item.rotation_deg,
            layer="I-FURN-OUTL",
            alignment="center",
        ))

    return labels


def generate_electrical_annotations(
    points: list[ElectricalPoint],
) -> list[LeaderNote]:
    """Generate leader annotations for electrical points.

    Parameters
    ----------
    points:
        Electrical points with positions.

    Returns
    -------
    list[LeaderNote]
        Leader notes with circuit and type information.
    """
    leaders: list[LeaderNote] = []

    for point in points:
        label = f"{point.type.upper()} ({point.circuit})"
        if point.height_mm != 1200:
            label += f"\\PH: {point.height_mm:.0f}mm"

        # Offset the text slightly from the point
        text_x = point.position.x + 400
        text_y = point.position.y + 200

        leaders.append(LeaderNote(
            anchor=(point.position.x, point.position.y),
            text_position=(text_x, text_y),
            text=label,
            layer="E-LITE" if point.circuit == "lighting" else "E-POWR",
        ))

    return leaders


def generate_drawing_notes(
    drawing_type: str,
    room_type: str,
    scale: str = "1:50",
) -> list[str]:
    """Generate standard notes for the drawing type.

    Parameters
    ----------
    drawing_type:
        Type of drawing (floor_plan, elevation, etc.).
    room_type:
        Type of room.
    scale:
        Drawing scale string.

    Returns
    -------
    list[str]
        List of note strings.
    """
    notes: list[str] = [
        f"1. ALL DIMENSIONS ARE IN MILLIMETRES UNLESS OTHERWISE NOTED",
        f"2. DRAWING SCALE: {scale}",
        "3. DO NOT SCALE FROM THIS DRAWING",
        "4. ALL DIMENSIONS TO BE VERIFIED ON SITE BEFORE FABRICATION",
    ]

    if drawing_type == "floor_plan":
        notes.extend([
            "5. WALL THICKNESSES SHOWN ARE NOMINAL",
            "6. DOOR SWING DIRECTION IS INDICATIVE",
        ])
    elif drawing_type == "elevation":
        notes.extend([
            "5. HEIGHTS ARE FROM FINISHED FLOOR LEVEL (FFL)",
            "6. MATERIAL FINISHES TO BE CONFIRMED WITH DESIGNER",
        ])
    elif drawing_type == "electrical_layout":
        notes.extend([
            "5. ALL ELECTRICAL WORK TO CONFORM TO IS 732",
            "6. SWITCH HEIGHTS: 1200mm FFL UNLESS NOTED",
            "7. SOCKET HEIGHTS: 300mm FFL UNLESS NOTED",
            "8. ALL CIRCUITS TO BE CONFIRMED WITH ELECTRICAL ENGINEER",
        ])
    elif drawing_type == "rcp":
        notes.extend([
            "5. CEILING HEIGHTS ARE FROM FFL",
            "6. FALSE CEILING DROPS AS MARKED",
            "7. LIGHT FIXTURE POSITIONS ARE INDICATIVE",
        ])
    elif drawing_type == "flooring_layout":
        notes.extend([
            "5. TILE LAYING PATTERN AS SHOWN",
            "6. SKIRTING HEIGHT: 100mm UNLESS NOTED",
            "7. GROUTING WIDTH: 2mm STANDARD",
        ])

    return notes


def generate_complete_annotations(
    walls: list[WallSegment],
    furniture: list[FurnitureItem],
    electrical_points: list[ElectricalPoint],
    room_name: str,
    room_type: str,
    length_mm: float,
    width_mm: float,
    drawing_type: str,
    scale: str = "1:50",
) -> AnnotationSet:
    """Generate a complete set of annotations for a drawing.

    Parameters
    ----------
    walls:
        Wall segments.
    furniture:
        Placed furniture items.
    electrical_points:
        Electrical point positions.
    room_name:
        Room display name.
    room_type:
        Room type string.
    length_mm:
        Room length in mm.
    width_mm:
        Room width in mm.
    drawing_type:
        Drawing type string.
    scale:
        Drawing scale string.

    Returns
    -------
    AnnotationSet
        Complete annotation set ready for rendering.
    """
    dimensions = generate_wall_dimensions(walls)
    room_label = generate_room_label(room_name, room_type, length_mm, width_mm)
    furniture_labels = generate_furniture_labels(furniture)
    electrical_leaders = generate_electrical_annotations(electrical_points)
    notes = generate_drawing_notes(drawing_type, room_type, scale)

    return AnnotationSet(
        dimensions=dimensions,
        labels=[room_label] + furniture_labels,
        leaders=electrical_leaders,
        notes=notes,
    )


# -- Private helpers --------------------------------------------------------

def _point_along_line(
    sx: float, sy: float, ex: float, ey: float, distance: float,
) -> tuple[float, float]:
    """Return a point at a given distance along a line segment."""
    length = math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
    if length == 0:
        return (sx, sy)
    ratio = distance / length
    return (sx + (ex - sx) * ratio, sy + (ey - sy) * ratio)
