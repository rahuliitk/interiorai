"""
SVG drawing writer for web preview.

Generates lightweight SVG files suitable for embedding in the web frontend.
Uses ``svgwrite`` for clean, readable SVG output with CSS classes matching
the CAD layer names for client-side styling.
"""

from __future__ import annotations

import io
import math
from typing import Any

import structlog
import svgwrite
from svgwrite.container import Group

from src.templates.title_block import calculate_scale_factor

logger = structlog.get_logger(__name__)

# SVG colour palette (CSS-friendly, matching CAD layer semantics)
LAYER_SVG_STYLES: dict[str, dict[str, str]] = {
    "A-WALL": {"stroke": "#1a1a1a", "stroke-width": "2.5", "fill": "none"},
    "A-WALL-INT": {"stroke": "#666666", "stroke-width": "1.5", "fill": "none"},
    "A-DOOR": {"stroke": "#cc3333", "stroke-width": "1.2", "fill": "none"},
    "A-GLAZ": {"stroke": "#3366cc", "stroke-width": "1.2", "fill": "none"},
    "I-FURN": {"stroke": "#339933", "stroke-width": "1.0", "fill": "#e8f5e9"},
    "I-FURN-OUTL": {"stroke": "#66aa66", "stroke-width": "0.5", "fill": "none"},
    "A-ANNO-DIMS": {"stroke": "#999900", "stroke-width": "0.5", "fill": "none"},
    "A-ANNO-NOTE": {"stroke": "#333333", "stroke-width": "0.3", "fill": "none"},
    "E-LITE": {"stroke": "#cc0000", "stroke-width": "1.0", "fill": "#ffebee"},
    "E-POWR": {"stroke": "#cc3300", "stroke-width": "1.0", "fill": "#fff3e0"},
    "E-WIRE": {"stroke": "#cc6666", "stroke-width": "0.5", "fill": "none",
               "stroke-dasharray": "4,2"},
    "A-CLNG": {"stroke": "#9933cc", "stroke-width": "1.0", "fill": "none"},
    "A-CLNG-GRID": {"stroke": "#b366e0", "stroke-width": "0.5", "fill": "none",
                    "stroke-dasharray": "3,2"},
    "I-FLOR": {"stroke": "#cc8800", "stroke-width": "0.8", "fill": "none"},
    "I-FLOR-PATT": {"stroke": "#ccaa66", "stroke-width": "0.3", "fill": "none"},
    "A-SECT": {"stroke": "#000000", "stroke-width": "3.0", "fill": "#e0e0e0"},
}

# SVG canvas padding (px)
SVG_PADDING = 60


def create_svg_drawing(
    drawing_data: dict[str, Any],
    drawing_type: str = "floor_plan",
    max_width_px: int = 1200,
    max_height_px: int = 900,
) -> bytes:
    """Create an SVG drawing for web preview.

    Parameters
    ----------
    drawing_data:
        Structured drawing data from the DrawingAgent.
    drawing_type:
        Specific drawing type to render.
    max_width_px:
        Maximum SVG width in pixels.
    max_height_px:
        Maximum SVG height in pixels.

    Returns
    -------
    bytes
        The SVG file contents (UTF-8).
    """
    dims = drawing_data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)
    height_mm = dims.get("height_mm", 2700)

    # For elevation and section, use height as the vertical axis
    if drawing_type in ("elevation", "section"):
        view_width = length_mm
        view_height = height_mm
    else:
        view_width = length_mm
        view_height = width_mm

    # Calculate scale to fit in canvas
    usable_w = max_width_px - 2 * SVG_PADDING
    usable_h = max_height_px - 2 * SVG_PADDING

    scale_x = usable_w / view_width
    scale_y = usable_h / view_height
    svg_scale = min(scale_x, scale_y)

    svg_width = view_width * svg_scale + 2 * SVG_PADDING
    svg_height = view_height * svg_scale + 2 * SVG_PADDING

    dwg = svgwrite.Drawing(
        size=(f"{svg_width}px", f"{svg_height}px"),
        viewBox=f"0 0 {svg_width} {svg_height}",
    )

    # Add CSS styles
    _add_css_styles(dwg)

    # Create main drawing group with transform
    main_group = dwg.g(
        id="drawing",
        transform=f"translate({SVG_PADDING}, {svg_height - SVG_PADDING}) scale({svg_scale}, -{svg_scale})",
    )

    # Draw entities based on type
    if drawing_type in ("floor_plan", "furnished_plan"):
        _svg_draw_walls(main_group, dwg, drawing_data)
        _svg_draw_doors(main_group, dwg, drawing_data)
        _svg_draw_windows(main_group, dwg, drawing_data)
        if drawing_type == "furnished_plan":
            _svg_draw_furniture(main_group, dwg, drawing_data, svg_scale)

    elif drawing_type == "electrical_layout":
        _svg_draw_walls(main_group, dwg, drawing_data)
        _svg_draw_doors(main_group, dwg, drawing_data)
        _svg_draw_electrical(main_group, dwg, drawing_data)

    elif drawing_type == "rcp":
        _svg_draw_walls(main_group, dwg, drawing_data)
        _svg_draw_ceiling(main_group, dwg, drawing_data)

    elif drawing_type == "flooring_layout":
        _svg_draw_walls(main_group, dwg, drawing_data)
        _svg_draw_flooring(main_group, dwg, drawing_data)

    elif drawing_type == "elevation":
        _svg_draw_elevation(main_group, dwg, drawing_data)

    elif drawing_type == "section":
        _svg_draw_section(main_group, dwg, drawing_data)

    dwg.add(main_group)

    # Add non-transformed UI elements (labels, legend)
    _svg_add_info(dwg, drawing_data, drawing_type, svg_width, svg_height)

    # Write to bytes
    buf = io.BytesIO()
    dwg.write(buf, pretty=True)
    buf.seek(0)
    return buf.read()


# -- CSS styles -------------------------------------------------------------

def _add_css_styles(dwg: svgwrite.Drawing) -> None:
    """Add CSS stylesheet to the SVG."""
    css_rules: list[str] = []
    for layer_name, styles in LAYER_SVG_STYLES.items():
        cls = layer_name.replace("-", "_").lower()
        props = "; ".join(f"{k}: {v}" for k, v in styles.items())
        css_rules.append(f".{cls} {{ {props} }}")

    css_rules.extend([
        ".label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; fill: #333; }",
        ".room-label { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; "
        "font-weight: bold; fill: #2F5496; }",
        ".dim-text { font-family: 'Courier New', monospace; font-size: 8px; fill: #666; }",
        ".info-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; fill: #333; }",
        ".title-text { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; "
        "font-weight: bold; fill: #2F5496; }",
    ])

    style_element = dwg.style("\n".join(css_rules))
    dwg.defs.add(style_element)


def _layer_class(layer: str) -> str:
    """Convert a layer name to a CSS class name."""
    return layer.replace("-", "_").lower()


# -- Wall drawing -----------------------------------------------------------

def _svg_draw_walls(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw walls on the SVG."""
    walls = data.get("entities", {}).get("walls", [])

    for wall in walls:
        start = wall["start"]
        end = wall["end"]
        thickness = wall.get("thickness", 150)
        layer = "A-WALL" if wall.get("wall_type") == "external" else "A-WALL-INT"
        cls = _layer_class(layer)

        # Inner line
        group.add(dwg.line(
            start=(start[0], start[1]),
            end=(end[0], end[1]),
            class_=cls,
        ))

        # Outer line
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.sqrt(dx * dx + dy * dy)
        if length > 0:
            nx = -dy / length * thickness
            ny = dx / length * thickness

            group.add(dwg.line(
                start=(start[0] + nx, start[1] + ny),
                end=(end[0] + nx, end[1] + ny),
                class_=cls,
            ))

            # End caps
            group.add(dwg.line(
                start=(start[0], start[1]),
                end=(start[0] + nx, start[1] + ny),
                class_=cls,
            ))
            group.add(dwg.line(
                start=(end[0], end[1]),
                end=(end[0] + nx, end[1] + ny),
                class_=cls,
            ))


def _svg_draw_doors(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw doors on the SVG."""
    doors = data.get("entities", {}).get("doors", [])
    cls = _layer_class("A-DOOR")

    for door in doors:
        ws = door["wall_start"]
        offset = door["offset"]
        width = door["width"]
        dx = door["wall_end"][0] - ws[0]
        dy = door["wall_end"][1] - ws[1]
        length = math.sqrt(dx * dx + dy * dy)
        if length == 0:
            continue

        ux = dx / length
        uy = dy / length
        nx = -uy
        ny = ux

        hx = ws[0] + ux * offset
        hy = ws[1] + uy * offset
        leaf_end_x = hx + nx * width
        leaf_end_y = hy + ny * width

        # Door leaf
        group.add(dwg.line(
            start=(hx, hy),
            end=(leaf_end_x, leaf_end_y),
            class_=cls,
        ))

        # Arc path
        start_angle = math.atan2(uy, ux)
        end_angle = math.atan2(ny, nx)

        # SVG arc
        arc_start_x = hx + math.cos(start_angle) * width
        arc_start_y = hy + math.sin(start_angle) * width

        sweep_flag = 0
        large_arc = 0
        angle_diff = end_angle - start_angle
        if angle_diff < 0:
            angle_diff += 2 * math.pi

        if angle_diff > math.pi:
            large_arc = 1

        path_d = (
            f"M {arc_start_x},{arc_start_y} "
            f"A {width},{width} 0 {large_arc},{sweep_flag} "
            f"{leaf_end_x},{leaf_end_y}"
        )
        group.add(dwg.path(d=path_d, class_=cls))


def _svg_draw_windows(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw windows on the SVG."""
    windows = data.get("entities", {}).get("windows", [])
    cls = _layer_class("A-GLAZ")

    for window in windows:
        ws = window["wall_start"]
        we = window["wall_end"]
        offset = window["offset"]
        width = window["width"]

        dx = we[0] - ws[0]
        dy = we[1] - ws[1]
        length = math.sqrt(dx * dx + dy * dy)
        if length == 0:
            continue

        ux = dx / length
        uy = dy / length

        w_sx = ws[0] + ux * offset
        w_sy = ws[1] + uy * offset
        w_ex = w_sx + ux * width
        w_ey = w_sy + uy * width

        for t in (-0.3, 0, 0.3):
            nx = -uy * 75 * t
            ny = ux * 75 * t
            group.add(dwg.line(
                start=(w_sx + nx, w_sy + ny),
                end=(w_ex + nx, w_ey + ny),
                class_=cls,
            ))


def _svg_draw_furniture(
    group: Group, dwg: svgwrite.Drawing, data: dict[str, Any], svg_scale: float,
) -> None:
    """Draw furniture on the SVG."""
    furniture = data.get("entities", {}).get("furniture", [])
    cls = _layer_class("I-FURN")
    cls_outline = _layer_class("I-FURN-OUTL")

    for item in furniture:
        pos = item["position"]
        w = item["width"]
        d = item["depth"]
        rotation = item.get("rotation", 0)
        name = item.get("name", "")

        if rotation in (90, 270):
            w, d = d, w

        # Rectangle
        group.add(dwg.rect(
            insert=(pos[0], pos[1]),
            size=(w, d),
            class_=cls,
        ))

        # Cross
        group.add(dwg.line(
            start=(pos[0], pos[1]),
            end=(pos[0] + w, pos[1] + d),
            class_=cls_outline,
        ))
        group.add(dwg.line(
            start=(pos[0] + w, pos[1]),
            end=(pos[0], pos[1] + d),
            class_=cls_outline,
        ))

        # Label (note: SVG text in a flipped coordinate system)
        label_group = dwg.g(
            transform=f"translate({pos[0] + w / 2}, {pos[1] + d / 2}) scale(1, -1)",
        )
        label_group.add(dwg.text(
            name.upper(),
            insert=(0, 0),
            class_="label",
            text_anchor="middle",
            dominant_baseline="middle",
            font_size=f"{max(60, min(120, w * 0.15))}",
        ))
        group.add(label_group)


def _svg_draw_electrical(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw electrical symbols on the SVG."""
    electrical = data.get("entities", {}).get("electrical", [])

    for point in electrical:
        pos = point["position"]
        elec_type = point.get("elec_type", "socket")

        if elec_type in ("light", "fan"):
            cls = _layer_class("E-LITE")
            r = 100
            group.add(dwg.circle(center=(pos[0], pos[1]), r=r, class_=cls))
            group.add(dwg.line(
                start=(pos[0] - r * 0.7, pos[1]),
                end=(pos[0] + r * 0.7, pos[1]),
                class_=cls,
            ))
            group.add(dwg.line(
                start=(pos[0], pos[1] - r * 0.7),
                end=(pos[0], pos[1] + r * 0.7),
                class_=cls,
            ))
        elif elec_type == "switch":
            cls = _layer_class("E-POWR")
            s = 60
            group.add(dwg.rect(
                insert=(pos[0] - s, pos[1] - s),
                size=(2 * s, 2 * s),
                class_=cls,
            ))
        else:
            cls = _layer_class("E-POWR")
            group.add(dwg.circle(center=(pos[0], pos[1]), r=50, class_=cls))


def _svg_draw_ceiling(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw ceiling elements on the SVG."""
    analysis = data.get("analysis", {})
    ceiling_type = analysis.get("ceiling_type", "none")
    if ceiling_type == "none":
        return

    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)
    cls = _layer_class("A-CLNG")

    # Room outline (dashed)
    group.add(dwg.rect(
        insert=(0, 0), size=(length_mm, width_mm),
        class_=_layer_class("A-CLNG-GRID"),
    ))

    if ceiling_type == "peripheral":
        inset = 300
        group.add(dwg.rect(
            insert=(inset, inset),
            size=(length_mm - 2 * inset, width_mm - 2 * inset),
            class_=cls,
        ))


def _svg_draw_flooring(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw flooring grid on the SVG."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    flooring = data.get("entities", {}).get("flooring", [{}])
    if not flooring:
        return

    floor_data = flooring[0]
    tile_size = floor_data.get("tile_size", [600, 600])
    cls = _layer_class("I-FLOR-PATT")

    x = 0.0
    while x <= length_mm:
        group.add(dwg.line(start=(x, 0), end=(x, width_mm), class_=cls))
        x += tile_size[0]

    y = 0.0
    while y <= width_mm:
        group.add(dwg.line(start=(0, y), end=(length_mm, y), class_=cls))
        y += tile_size[1]


def _svg_draw_elevation(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw elevation on the SVG."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    height_mm = dims.get("height_mm", 2700)
    cls = _layer_class("A-WALL")

    group.add(dwg.rect(insert=(0, 0), size=(length_mm, height_mm), class_=cls))

    # Windows
    windows = data.get("entities", {}).get("windows", [])
    cls_win = _layer_class("A-GLAZ")
    for window in windows:
        w_offset = window["offset"]
        w_width = window["width"]
        w_height = window.get("height", 1200)
        w_sill = window.get("sill", 900)

        group.add(dwg.rect(
            insert=(w_offset, w_sill),
            size=(w_width, w_height),
            class_=cls_win,
        ))


def _svg_draw_section(group: Group, dwg: svgwrite.Drawing, data: dict[str, Any]) -> None:
    """Draw section on the SVG."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    height_mm = dims.get("height_mm", 2700)
    t = 150
    cls = _layer_class("A-SECT")

    # Floor slab
    group.add(dwg.rect(insert=(-t, -t), size=(length_mm + 2 * t, t), class_=cls))
    # Ceiling slab
    group.add(dwg.rect(insert=(-t, height_mm), size=(length_mm + 2 * t, t), class_=cls))
    # Left wall
    group.add(dwg.rect(insert=(-t, 0), size=(t, height_mm), class_=cls))
    # Right wall
    group.add(dwg.rect(insert=(length_mm, 0), size=(t, height_mm), class_=cls))

    # Room interior
    cls_wall = _layer_class("A-WALL")
    group.add(dwg.rect(insert=(0, 0), size=(length_mm, height_mm), class_=cls_wall))


# -- Info overlay -----------------------------------------------------------

def _svg_add_info(
    dwg: svgwrite.Drawing,
    data: dict[str, Any],
    drawing_type: str,
    svg_width: float,
    svg_height: float,
) -> None:
    """Add informational text overlay (not transformed with the drawing)."""
    room_name = data.get("room_name", "Room")
    drawing_title = drawing_type.replace("_", " ").title()
    scale = data.get("scale", "1:50")

    info_group = dwg.g(id="info")

    info_group.add(dwg.text(
        f"{room_name} -- {drawing_title}",
        insert=(SVG_PADDING, 20),
        class_="title-text",
    ))

    info_group.add(dwg.text(
        f"Scale: {scale} | Project: {data.get('project_id', '')}",
        insert=(SVG_PADDING, 36),
        class_="info-text",
    ))

    # Legend at bottom right
    info_group.add(dwg.text(
        "Generated by OpenLintel Drawing Generator",
        insert=(svg_width - SVG_PADDING, svg_height - 8),
        class_="info-text",
        text_anchor="end",
        font_size="9",
        fill="#999",
    ))

    dwg.add(info_group)
