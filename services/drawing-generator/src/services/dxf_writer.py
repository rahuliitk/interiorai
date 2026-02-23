"""
DXF drawing writer using ezdxf.

Creates AutoCAD-compatible DXF files with proper layers, line styles,
dimensions, and annotations.  Supports floor plans, furnished plans,
elevations, sections, reflected ceiling plans, electrical layouts,
and flooring layouts.
"""

from __future__ import annotations

import io
import math
from typing import Any

import ezdxf
from ezdxf import units
from ezdxf.document import Drawing
from ezdxf.layouts import Modelspace
from ezdxf.math import Vec2

import structlog

from src.templates.layers import ALL_LAYERS, LayerDef
from src.templates.title_block import (
    TitleBlockData,
    calculate_scale_factor,
    get_drawing_area,
    get_paper_dimensions,
    get_title_block_coords,
)

logger = structlog.get_logger(__name__)


def create_dxf_drawing(
    drawing_data: dict[str, Any],
    drawing_type: str = "floor_plan",
) -> bytes:
    """Create a complete DXF drawing from structured drawing data.

    Parameters
    ----------
    drawing_data:
        The structured drawing data from the DrawingAgent.
    drawing_type:
        The specific drawing type to generate.

    Returns
    -------
    bytes
        The DXF file contents.
    """
    doc = ezdxf.new("R2013", setup=True)
    doc.units = units.MM
    msp = doc.modelspace()

    # Set up layers
    _setup_layers(doc, drawing_data.get("active_layers", []))

    # Set up line types
    _setup_linetypes(doc)

    dims = drawing_data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    # Draw based on type
    if drawing_type in ("floor_plan", "furnished_plan"):
        _draw_floor_plan(msp, drawing_data)
        if drawing_type == "furnished_plan":
            _draw_furniture(msp, drawing_data)
    elif drawing_type == "elevation":
        _draw_elevation(msp, drawing_data)
    elif drawing_type == "section":
        _draw_section(msp, drawing_data)
    elif drawing_type == "rcp":
        _draw_rcp(msp, drawing_data)
    elif drawing_type == "electrical_layout":
        _draw_floor_plan(msp, drawing_data)
        _draw_electrical(msp, drawing_data)
    elif drawing_type == "flooring_layout":
        _draw_floor_plan(msp, drawing_data)
        _draw_flooring(msp, drawing_data)

    # Add dimensions
    _draw_dimensions(msp, drawing_data)

    # Add annotations
    _draw_annotations(msp, drawing_data, drawing_type)

    # Write to bytes
    stream = io.BytesIO()
    doc.write(stream)
    stream.seek(0)
    return stream.read()


# -- Layer setup ------------------------------------------------------------

def _setup_layers(doc: Drawing, active_layer_names: list[str]) -> None:
    """Create CAD layers in the DXF document."""
    for layer_def in ALL_LAYERS:
        if not active_layer_names or layer_def.name in active_layer_names:
            if layer_def.name not in doc.layers:
                doc.layers.add(
                    name=layer_def.name,
                    color=layer_def.color,
                    linetype=layer_def.linetype if layer_def.linetype in doc.linetypes else "Continuous",
                )


def _setup_linetypes(doc: Drawing) -> None:
    """Set up custom line types if not already present."""
    if "DASHED" not in doc.linetypes:
        doc.linetypes.add(
            "DASHED",
            pattern=[0.5, 0.25, -0.25],
            description="Dashed line __ __ __",
        )
    if "CENTER" not in doc.linetypes:
        doc.linetypes.add(
            "CENTER",
            pattern=[1.25, 0.75, -0.25, 0.25, -0.25],
            description="Center line ___ _ ___ _ ___",
        )


# -- Floor plan drawing -----------------------------------------------------

def _draw_floor_plan(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw walls, doors, and windows for a floor plan."""
    walls = data.get("entities", {}).get("walls", [])
    doors = data.get("entities", {}).get("doors", [])
    windows = data.get("entities", {}).get("windows", [])

    # Draw walls as filled rectangles (double lines)
    for wall in walls:
        start = wall["start"]
        end = wall["end"]
        thickness = wall.get("thickness", 150)
        layer = "A-WALL" if wall.get("wall_type") == "external" else "A-WALL-INT"

        _draw_wall_segment(msp, start, end, thickness, layer)

    # Draw doors
    for door in doors:
        _draw_door(msp, door)

    # Draw windows
    for window in windows:
        _draw_window(msp, window)


def _draw_wall_segment(
    msp: Modelspace,
    start: tuple[float, float],
    end: tuple[float, float],
    thickness: float,
    layer: str,
) -> None:
    """Draw a wall as a pair of parallel lines with end caps."""
    sx, sy = start
    ex, ey = end

    # Calculate wall normal direction
    dx = ex - sx
    dy = ey - sy
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return

    # Normal vector (perpendicular, outward)
    nx = -dy / length * thickness
    ny = dx / length * thickness

    # Inner and outer wall lines
    # Inner line (room side)
    msp.add_line((sx, sy), (ex, ey), dxfattribs={"layer": layer})

    # Outer line
    msp.add_line(
        (sx + nx, sy + ny),
        (ex + nx, ey + ny),
        dxfattribs={"layer": layer},
    )

    # End caps
    msp.add_line(
        (sx, sy),
        (sx + nx, sy + ny),
        dxfattribs={"layer": layer},
    )
    msp.add_line(
        (ex, ey),
        (ex + nx, ey + ny),
        dxfattribs={"layer": layer},
    )


def _draw_door(msp: Modelspace, door: dict[str, Any]) -> None:
    """Draw a door with opening arc in plan view."""
    ws = door["wall_start"]
    we = door["wall_end"]
    offset = door["offset"]
    width = door["width"]

    dx = we[0] - ws[0]
    dy = we[1] - ws[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return

    # Unit direction along wall
    ux = dx / length
    uy = dy / length

    # Door hinge point
    hx = ws[0] + ux * offset
    hy = ws[1] + uy * offset

    # Door end point
    ex = hx + ux * width
    ey = hy + uy * width

    # Draw door leaf line (90-degree opening)
    # Normal direction (into the room)
    nx = -uy
    ny = ux

    leaf_end_x = hx + nx * width
    leaf_end_y = hy + ny * width

    # Door leaf
    msp.add_line(
        (hx, hy),
        (leaf_end_x, leaf_end_y),
        dxfattribs={"layer": "A-DOOR"},
    )

    # Door swing arc (quarter circle)
    msp.add_arc(
        center=(hx, hy),
        radius=width,
        start_angle=math.degrees(math.atan2(uy, ux)),
        end_angle=math.degrees(math.atan2(ny, nx)),
        dxfattribs={"layer": "A-DOOR"},
    )

    # Door opening gap in wall (break lines)
    # This is handled by not drawing the wall through the door opening


def _draw_window(msp: Modelspace, window: dict[str, Any]) -> None:
    """Draw a window in plan view (double lines with glass indication)."""
    ws = window["wall_start"]
    we = window["wall_end"]
    offset = window["offset"]
    width = window["width"]

    dx = we[0] - ws[0]
    dy = we[1] - ws[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length == 0:
        return

    ux = dx / length
    uy = dy / length
    nx = -uy * 75  # Half wall thickness for window centre
    ny = ux * 75

    # Window start and end along wall
    w_sx = ws[0] + ux * offset
    w_sy = ws[1] + uy * offset
    w_ex = w_sx + ux * width
    w_ey = w_sy + uy * width

    # Draw window as three parallel lines (glass panes)
    for t in (-1, 0, 1):
        msp.add_line(
            (w_sx + nx * t * 0.3, w_sy + ny * t * 0.3),
            (w_ex + nx * t * 0.3, w_ey + ny * t * 0.3),
            dxfattribs={"layer": "A-GLAZ"},
        )


# -- Furniture drawing ------------------------------------------------------

def _draw_furniture(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw furniture items as rectangles with labels."""
    furniture = data.get("entities", {}).get("furniture", [])

    for item in furniture:
        pos = item["position"]
        w = item["width"]
        d = item["depth"]
        rotation = item.get("rotation", 0)
        name = item.get("name", "")

        if rotation in (90, 270):
            w, d = d, w

        # Draw rectangle
        points = [
            (pos[0], pos[1]),
            (pos[0] + w, pos[1]),
            (pos[0] + w, pos[1] + d),
            (pos[0], pos[1] + d),
            (pos[0], pos[1]),
        ]
        msp.add_lwpolyline(
            points,
            dxfattribs={"layer": "I-FURN"},
        )

        # Cross lines to indicate furniture
        msp.add_line(
            (pos[0], pos[1]),
            (pos[0] + w, pos[1] + d),
            dxfattribs={"layer": "I-FURN-OUTL"},
        )
        msp.add_line(
            (pos[0] + w, pos[1]),
            (pos[0], pos[1] + d),
            dxfattribs={"layer": "I-FURN-OUTL"},
        )

        # Furniture label
        cx = pos[0] + w / 2
        cy = pos[1] + d / 2
        msp.add_text(
            name.upper(),
            dxfattribs={
                "layer": "I-FURN-OUTL",
                "height": min(w, d) * 0.12,
                "insert": (cx, cy),
                "halign": ezdxf.const.CENTER,
                "valign": ezdxf.const.MIDDLE,
            },
        ).set_placement((cx, cy), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)


# -- Elevation drawing ------------------------------------------------------

def _draw_elevation(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw an interior elevation view."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    height_mm = dims.get("height_mm", 2700)

    # Floor line
    msp.add_line((0, 0), (length_mm, 0), dxfattribs={"layer": "A-WALL"})

    # Ceiling line
    msp.add_line((0, height_mm), (length_mm, height_mm), dxfattribs={"layer": "A-WALL"})

    # Side walls
    msp.add_line((0, 0), (0, height_mm), dxfattribs={"layer": "A-WALL"})
    msp.add_line((length_mm, 0), (length_mm, height_mm), dxfattribs={"layer": "A-WALL"})

    # Draw windows in elevation
    windows = data.get("entities", {}).get("windows", [])
    for window in windows:
        w_width = window["width"]
        w_height = window.get("height", 1200)
        w_sill = window.get("sill", 900)
        w_offset = window["offset"]

        # Window rectangle
        points = [
            (w_offset, w_sill),
            (w_offset + w_width, w_sill),
            (w_offset + w_width, w_sill + w_height),
            (w_offset, w_sill + w_height),
            (w_offset, w_sill),
        ]
        msp.add_lwpolyline(points, dxfattribs={"layer": "A-GLAZ"})

        # Window cross
        msp.add_line(
            (w_offset, w_sill + w_height / 2),
            (w_offset + w_width, w_sill + w_height / 2),
            dxfattribs={"layer": "A-GLAZ"},
        )
        msp.add_line(
            (w_offset + w_width / 2, w_sill),
            (w_offset + w_width / 2, w_sill + w_height),
            dxfattribs={"layer": "A-GLAZ"},
        )

    # Draw furniture in elevation (simplified)
    furniture = data.get("entities", {}).get("furniture", [])
    for item in furniture:
        pos = item["position"]
        w = item["width"]
        h = item.get("height", 750)

        points = [
            (pos[0], 0),
            (pos[0] + w, 0),
            (pos[0] + w, h),
            (pos[0], h),
            (pos[0], 0),
        ]
        msp.add_lwpolyline(points, dxfattribs={"layer": "I-FURN"})


# -- Section drawing --------------------------------------------------------

def _draw_section(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw a cross-section view."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)
    height_mm = dims.get("height_mm", 2700)

    wall_thickness = 150

    # Floor slab
    msp.add_lwpolyline(
        [(-wall_thickness, -150), (length_mm + wall_thickness, -150),
         (length_mm + wall_thickness, 0), (-wall_thickness, 0), (-wall_thickness, -150)],
        dxfattribs={"layer": "A-SECT"},
    )

    # Left wall (cut through)
    msp.add_lwpolyline(
        [(-wall_thickness, 0), (0, 0), (0, height_mm), (-wall_thickness, height_mm),
         (-wall_thickness, 0)],
        dxfattribs={"layer": "A-SECT"},
    )

    # Right wall (cut through)
    msp.add_lwpolyline(
        [(length_mm, 0), (length_mm + wall_thickness, 0),
         (length_mm + wall_thickness, height_mm), (length_mm, height_mm),
         (length_mm, 0)],
        dxfattribs={"layer": "A-SECT"},
    )

    # Ceiling slab
    msp.add_lwpolyline(
        [(-wall_thickness, height_mm), (length_mm + wall_thickness, height_mm),
         (length_mm + wall_thickness, height_mm + 150),
         (-wall_thickness, height_mm + 150), (-wall_thickness, height_mm)],
        dxfattribs={"layer": "A-SECT"},
    )

    # Room interior floor line
    msp.add_line((0, 0), (length_mm, 0), dxfattribs={"layer": "A-WALL"})

    # Interior ceiling line
    msp.add_line((0, height_mm), (length_mm, height_mm), dxfattribs={"layer": "A-WALL"})

    # False ceiling (if present)
    analysis = data.get("analysis", {})
    ceiling_type = analysis.get("ceiling_type", "none")
    if ceiling_type != "none":
        drop = analysis.get("ceiling_drop_mm", 150)
        fc_height = height_mm - drop
        msp.add_line(
            (300, fc_height), (length_mm - 300, fc_height),
            dxfattribs={"layer": "A-CLNG", "linetype": "DASHED"},
        )

    # Section label
    msp.add_text(
        "SECTION A-A",
        dxfattribs={
            "layer": "A-ANNO-NOTE",
            "height": 120,
            "insert": (length_mm / 2, -400),
        },
    ).set_placement(
        (length_mm / 2, -400),
        align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
    )


# -- RCP drawing ------------------------------------------------------------

def _draw_rcp(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw a reflected ceiling plan."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    # Room outline (dashed, reflected view)
    msp.add_lwpolyline(
        [(0, 0), (length_mm, 0), (length_mm, width_mm), (0, width_mm), (0, 0)],
        dxfattribs={"layer": "A-WALL", "linetype": "DASHED"},
    )

    # False ceiling elements
    analysis = data.get("analysis", {})
    ceiling_type = analysis.get("ceiling_type", "peripheral")
    drop = analysis.get("ceiling_drop_mm", 150)
    inset = 300  # Standard peripheral inset

    if ceiling_type == "peripheral":
        # Peripheral false ceiling (L-shaped or rectangular border)
        inner = [
            (inset, inset),
            (length_mm - inset, inset),
            (length_mm - inset, width_mm - inset),
            (inset, width_mm - inset),
            (inset, inset),
        ]
        msp.add_lwpolyline(inner, dxfattribs={"layer": "A-CLNG"})

        # Cove lighting line (dashed, slightly inside)
        cove_inset = inset + 50
        cove = [
            (cove_inset, cove_inset),
            (length_mm - cove_inset, cove_inset),
            (length_mm - cove_inset, width_mm - cove_inset),
            (cove_inset, width_mm - cove_inset),
            (cove_inset, cove_inset),
        ]
        msp.add_lwpolyline(cove, dxfattribs={"layer": "A-CLNG-GRID", "linetype": "DASHED"})

    elif ceiling_type == "island":
        # Central island ceiling
        island_margin = length_mm * 0.2
        island = [
            (island_margin, island_margin),
            (length_mm - island_margin, island_margin),
            (length_mm - island_margin, width_mm - island_margin),
            (island_margin, width_mm - island_margin),
            (island_margin, island_margin),
        ]
        msp.add_lwpolyline(island, dxfattribs={"layer": "A-CLNG"})

    elif ceiling_type == "full":
        # Full false ceiling
        msp.add_lwpolyline(
            [(50, 50), (length_mm - 50, 50), (length_mm - 50, width_mm - 50),
             (50, width_mm - 50), (50, 50)],
            dxfattribs={"layer": "A-CLNG"},
        )

    # Draw light fixtures
    electrical = data.get("entities", {}).get("electrical", [])
    for point in electrical:
        if point.get("elec_type") in ("light", "fan"):
            pos = point["position"]
            _draw_light_symbol(msp, pos[0], pos[1], point.get("elec_type", "light"))

    # Height annotation
    msp.add_text(
        f"FC @ {drop}mm DROP",
        dxfattribs={
            "layer": "A-ANNO-NOTE",
            "height": 80,
            "insert": (length_mm / 2, width_mm / 2 + 200),
        },
    ).set_placement(
        (length_mm / 2, width_mm / 2 + 200),
        align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
    )


# -- Electrical layout drawing ---------------------------------------------

def _draw_electrical(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw electrical points and wiring runs on the floor plan."""
    electrical = data.get("entities", {}).get("electrical", [])

    for point in electrical:
        pos = point["position"]
        elec_type = point.get("elec_type", "socket")

        if elec_type == "light":
            _draw_light_symbol(msp, pos[0], pos[1], "light")
        elif elec_type == "fan":
            _draw_light_symbol(msp, pos[0], pos[1], "fan")
        elif elec_type == "switch":
            _draw_switch_symbol(msp, pos[0], pos[1])
        elif elec_type in ("socket", "ac"):
            _draw_socket_symbol(msp, pos[0], pos[1])
        elif elec_type == "exhaust":
            _draw_light_symbol(msp, pos[0], pos[1], "exhaust")

    # Draw wiring runs (simplified: connect switches to lights)
    switches = [p for p in electrical if p.get("elec_type") == "switch"]
    lights = [p for p in electrical if p.get("elec_type") in ("light", "fan")]

    for sw in switches:
        for lt in lights:
            msp.add_line(
                (sw["position"][0], sw["position"][1]),
                (lt["position"][0], lt["position"][1]),
                dxfattribs={"layer": "E-WIRE", "linetype": "DASHED"},
            )


# -- Flooring layout drawing ------------------------------------------------

def _draw_flooring(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw tile/flooring layout pattern."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    flooring = data.get("entities", {}).get("flooring", [{}])
    if not flooring:
        return

    floor_data = flooring[0]
    pattern = floor_data.get("pattern", "straight")
    tile_size = floor_data.get("tile_size", [600, 600])
    tile_w = tile_size[0]
    tile_h = tile_size[1]

    if pattern == "straight":
        _draw_straight_tiles(msp, length_mm, width_mm, tile_w, tile_h)
    elif pattern == "diagonal":
        _draw_diagonal_tiles(msp, length_mm, width_mm, tile_w)
    elif pattern == "herringbone":
        _draw_herringbone_tiles(msp, length_mm, width_mm, tile_w, tile_h)

    # Skirting line
    skirting_inset = 10
    msp.add_lwpolyline(
        [(skirting_inset, skirting_inset), (length_mm - skirting_inset, skirting_inset),
         (length_mm - skirting_inset, width_mm - skirting_inset),
         (skirting_inset, width_mm - skirting_inset),
         (skirting_inset, skirting_inset)],
        dxfattribs={"layer": "I-FLOR"},
    )


def _draw_straight_tiles(
    msp: Modelspace, length_mm: float, width_mm: float,
    tile_w: float, tile_h: float,
) -> None:
    """Draw straight-laid tile grid."""
    x = 0.0
    while x < length_mm:
        msp.add_line(
            (x, 0), (x, width_mm),
            dxfattribs={"layer": "I-FLOR-PATT"},
        )
        x += tile_w

    y = 0.0
    while y < width_mm:
        msp.add_line(
            (0, y), (length_mm, y),
            dxfattribs={"layer": "I-FLOR-PATT"},
        )
        y += tile_h


def _draw_diagonal_tiles(
    msp: Modelspace, length_mm: float, width_mm: float, tile_size: float,
) -> None:
    """Draw diagonal (45-degree) tile pattern."""
    diagonal = tile_size * math.sqrt(2) / 2
    max_dim = length_mm + width_mm

    # Lines from bottom-left to top-right
    offset = -max_dim
    while offset < max_dim:
        x1 = max(0, offset)
        y1 = max(0, -offset)
        x2 = min(length_mm, offset + max_dim)
        y2 = min(width_mm, max_dim - offset)

        if x1 < length_mm and y1 < width_mm:
            msp.add_line(
                (offset, 0), (offset + width_mm, width_mm),
                dxfattribs={"layer": "I-FLOR-PATT"},
            )
        offset += diagonal

    # Lines from bottom-right to top-left
    offset = -max_dim
    while offset < max_dim:
        msp.add_line(
            (length_mm + offset, 0), (offset, width_mm),
            dxfattribs={"layer": "I-FLOR-PATT"},
        )
        offset += diagonal


def _draw_herringbone_tiles(
    msp: Modelspace, length_mm: float, width_mm: float,
    tile_w: float, tile_h: float,
) -> None:
    """Draw herringbone tile pattern."""
    unit_w = tile_w
    unit_h = tile_h / 2

    y = 0.0
    row = 0
    while y < width_mm:
        x = -unit_w if row % 2 else 0.0
        while x < length_mm:
            if row % 2 == 0:
                # Horizontal tile
                x1 = max(0, x)
                x2 = min(length_mm, x + unit_w)
                if x1 < x2:
                    msp.add_lwpolyline(
                        [(x1, y), (x2, y), (x2, y + unit_h), (x1, y + unit_h), (x1, y)],
                        dxfattribs={"layer": "I-FLOR-PATT"},
                    )
            else:
                # Vertical tile
                y1 = max(0, y)
                y2 = min(width_mm, y + unit_w)
                if y1 < y2:
                    msp.add_lwpolyline(
                        [(x, y1), (x + unit_h, y1), (x + unit_h, y2), (x, y2), (x, y1)],
                        dxfattribs={"layer": "I-FLOR-PATT"},
                    )
            x += unit_w
        y += unit_h
        row += 1


# -- Symbol drawing helpers -------------------------------------------------

def _draw_light_symbol(msp: Modelspace, x: float, y: float, light_type: str) -> None:
    """Draw a ceiling light symbol (circle with cross)."""
    radius = 100 if light_type == "light" else 120
    layer = "E-LITE"

    msp.add_circle((x, y), radius=radius, dxfattribs={"layer": layer})

    if light_type == "fan":
        # Fan symbol: circle with 4 arcs
        for angle in range(0, 360, 90):
            start = angle
            end = angle + 60
            msp.add_arc(
                center=(x, y), radius=radius * 0.7,
                start_angle=start, end_angle=end,
                dxfattribs={"layer": layer},
            )
    else:
        # Cross inside circle
        msp.add_line((x - radius * 0.7, y), (x + radius * 0.7, y), dxfattribs={"layer": layer})
        msp.add_line((x, y - radius * 0.7), (x, y + radius * 0.7), dxfattribs={"layer": layer})


def _draw_switch_symbol(msp: Modelspace, x: float, y: float) -> None:
    """Draw an electrical switch symbol."""
    size = 60
    layer = "E-POWR"

    # Small square
    msp.add_lwpolyline(
        [(x - size, y - size), (x + size, y - size), (x + size, y + size),
         (x - size, y + size), (x - size, y - size)],
        dxfattribs={"layer": layer},
    )
    # S label
    msp.add_text(
        "S",
        dxfattribs={"layer": layer, "height": size * 0.8, "insert": (x, y)},
    ).set_placement((x, y), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)


def _draw_socket_symbol(msp: Modelspace, x: float, y: float) -> None:
    """Draw an electrical socket/outlet symbol."""
    radius = 50
    layer = "E-POWR"

    msp.add_circle((x, y), radius=radius, dxfattribs={"layer": layer})
    # Line through circle
    msp.add_line(
        (x - radius, y), (x + radius, y),
        dxfattribs={"layer": layer},
    )


# -- Dimension and annotation drawing ---------------------------------------

def _draw_dimensions(msp: Modelspace, data: dict[str, Any]) -> None:
    """Draw dimension lines on the drawing."""
    dimensions = data.get("dimensions", [])
    dim_style = "EZDXF"

    for dim in dimensions:
        start = dim.get("start", (0, 0))
        end = dim.get("end", (0, 0))
        offset = dim.get("offset_mm", 500)
        text = dim.get("text", "")
        direction = dim.get("direction", "horizontal")

        try:
            if direction == "horizontal":
                dim_entity = msp.add_linear_dim(
                    base=(start[0], start[1] + offset),
                    p1=start,
                    p2=end,
                    override={"dimtxt": 80},
                    dxfattribs={"layer": "A-ANNO-DIMS"},
                )
                dim_entity.render()
            elif direction == "vertical":
                dim_entity = msp.add_linear_dim(
                    base=(start[0] + offset, start[1]),
                    p1=start,
                    p2=end,
                    angle=90,
                    override={"dimtxt": 80},
                    dxfattribs={"layer": "A-ANNO-DIMS"},
                )
                dim_entity.render()
            else:
                # Aligned dimension
                dim_entity = msp.add_aligned_dim(
                    p1=start,
                    p2=end,
                    distance=offset,
                    override={"dimtxt": 80},
                    dxfattribs={"layer": "A-ANNO-DIMS"},
                )
                dim_entity.render()
        except Exception:
            logger.warning("dimension_draw_failed", start=start, end=end, exc_info=True)


def _draw_annotations(msp: Modelspace, data: dict[str, Any], drawing_type: str) -> None:
    """Draw labels, notes, and leaders."""
    annotations = data.get("annotations", {})

    # Labels
    for label in annotations.get("labels", []):
        pos = label.get("position", (0, 0))
        text = label.get("text", "")
        height = label.get("height_mm", 100)
        layer = label.get("layer", "A-ANNO-NOTE")

        msp.add_text(
            text,
            dxfattribs={"layer": layer, "height": height, "insert": pos},
        ).set_placement(pos, align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    # Notes
    notes = annotations.get("notes", [])
    if notes:
        dims = data.get("room_dimensions", {})
        note_x = -500
        note_y = dims.get("width_mm", 3000) + 500

        for idx, note in enumerate(notes):
            msp.add_text(
                note,
                dxfattribs={
                    "layer": "A-ANNO-NOTE",
                    "height": 60,
                    "insert": (note_x, note_y - idx * 120),
                },
            )
