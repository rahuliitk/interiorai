"""
PDF drawing writer using ReportLab.

Renders technical drawings as PDF documents with title blocks, dimension
annotations, and notes.  Converts the same structured drawing data used
by the DXF writer into a printable PDF format.
"""

from __future__ import annotations

import io
import math
from typing import Any

import structlog
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from src.templates.title_block import (
    TITLE_BLOCK_HEIGHT_MM,
    TITLE_BLOCK_MARGIN_MM,
    TitleBlockData,
    calculate_scale_factor,
    get_drawing_area,
    get_paper_dimensions,
    get_title_block_coords,
)

logger = structlog.get_logger(__name__)

# Paper size mapping for ReportLab
PAPER_SIZE_MAP: dict[str, tuple[float, float]] = {
    "A4": landscape(A4),
    "A3": landscape(A3),
}

# Colour palette (matching DXF ACI colours)
LAYER_COLORS: dict[str, tuple[float, float, float]] = {
    "A-WALL": (0, 0, 0),
    "A-WALL-INT": (0.4, 0.4, 0.4),
    "A-DOOR": (0.8, 0, 0),
    "A-GLAZ": (0, 0, 0.8),
    "I-FURN": (0, 0.6, 0),
    "I-FURN-OUTL": (0.3, 0.6, 0.3),
    "A-ANNO-DIMS": (0.6, 0.6, 0),
    "A-ANNO-NOTE": (0.2, 0.2, 0.2),
    "E-LITE": (0.8, 0, 0),
    "E-POWR": (0.8, 0.2, 0),
    "E-WIRE": (0.7, 0.3, 0.3),
    "A-CLNG": (0.6, 0, 0.6),
    "A-CLNG-GRID": (0.7, 0.3, 0.7),
    "I-FLOR": (0.8, 0.5, 0),
    "I-FLOR-PATT": (0.8, 0.6, 0.3),
    "A-SECT": (0, 0, 0),
    "A-ANNO-TTLB": (0, 0, 0),
}

LAYER_LINEWIDTHS: dict[str, float] = {
    "A-WALL": 0.5,
    "A-WALL-INT": 0.35,
    "A-DOOR": 0.25,
    "A-GLAZ": 0.25,
    "I-FURN": 0.25,
    "I-FURN-OUTL": 0.18,
    "A-ANNO-DIMS": 0.13,
    "A-ANNO-NOTE": 0.13,
    "E-LITE": 0.25,
    "E-POWR": 0.25,
    "E-WIRE": 0.09,
    "A-CLNG": 0.25,
    "I-FLOR": 0.18,
    "I-FLOR-PATT": 0.09,
    "A-SECT": 0.7,
    "A-ANNO-TTLB": 0.35,
}


def create_pdf_drawing(
    drawing_data: dict[str, Any],
    drawing_type: str = "floor_plan",
    title_block_data: TitleBlockData | None = None,
) -> bytes:
    """Create a PDF drawing with title block.

    Parameters
    ----------
    drawing_data:
        Structured drawing data from the DrawingAgent.
    drawing_type:
        Specific drawing type to render.
    title_block_data:
        Optional title block data override.

    Returns
    -------
    bytes
        The PDF file contents.
    """
    paper_size = drawing_data.get("paper_size", "A3")
    page_size = PAPER_SIZE_MAP.get(paper_size, landscape(A3))

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=page_size)

    dims = drawing_data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    # Calculate scale
    scale_factor, scale_str = calculate_scale_factor(
        length_mm, width_mm, paper_size,
        drawing_data.get("scale", "1:50"),
    )

    # Drawing area
    x_min, y_min, x_max, y_max = get_drawing_area(paper_size)

    # Convert mm to points for ReportLab (1mm = ~2.83465pt)
    mm_to_pt = mm

    # Calculate drawing offset to centre the room in the drawing area
    drawn_length = length_mm * scale_factor
    drawn_width = width_mm * scale_factor
    offset_x = x_min + (x_max - x_min - drawn_length) / 2
    offset_y = y_min + (y_max - y_min - drawn_width) / 2

    def to_page(x: float, y: float) -> tuple[float, float]:
        """Convert room coordinates to page coordinates (mm to points)."""
        px = (offset_x + x * scale_factor) * mm_to_pt
        py = (offset_y + y * scale_factor) * mm_to_pt
        return px, py

    # Draw title block
    _draw_title_block(c, paper_size, drawing_data, title_block_data, scale_str)

    # Draw border
    _draw_border(c, paper_size)

    # Set up drawing context
    c.saveState()

    # Draw entities based on type
    if drawing_type in ("floor_plan", "furnished_plan"):
        _pdf_draw_walls(c, drawing_data, to_page)
        _pdf_draw_doors(c, drawing_data, to_page)
        _pdf_draw_windows(c, drawing_data, to_page)
        if drawing_type == "furnished_plan":
            _pdf_draw_furniture(c, drawing_data, to_page, scale_factor)

    elif drawing_type == "electrical_layout":
        _pdf_draw_walls(c, drawing_data, to_page)
        _pdf_draw_doors(c, drawing_data, to_page)
        _pdf_draw_electrical(c, drawing_data, to_page, scale_factor)

    elif drawing_type == "rcp":
        _pdf_draw_walls(c, drawing_data, to_page)
        _pdf_draw_ceiling(c, drawing_data, to_page, scale_factor)

    elif drawing_type == "flooring_layout":
        _pdf_draw_walls(c, drawing_data, to_page)
        _pdf_draw_flooring(c, drawing_data, to_page, scale_factor)

    elif drawing_type == "elevation":
        _pdf_draw_elevation(c, drawing_data, to_page, scale_factor)

    elif drawing_type == "section":
        _pdf_draw_section(c, drawing_data, to_page, scale_factor)

    # Draw dimensions
    _pdf_draw_dimensions(c, drawing_data, to_page, scale_factor)

    # Draw room label
    _pdf_draw_room_label(c, drawing_data, to_page, scale_factor)

    # Draw notes
    _pdf_draw_notes(c, drawing_data, paper_size)

    c.restoreState()
    c.save()

    buf.seek(0)
    return buf.read()


# -- Title block and border -------------------------------------------------

def _draw_border(c: canvas.Canvas, paper_size: str) -> None:
    """Draw the drawing border."""
    pw, ph = get_paper_dimensions(paper_size)
    margin = TITLE_BLOCK_MARGIN_MM

    c.setStrokeColor(colors.black)
    c.setLineWidth(0.7)
    c.rect(margin * mm, margin * mm, (pw - 2 * margin) * mm, (ph - 2 * margin) * mm)


def _draw_title_block(
    c: canvas.Canvas,
    paper_size: str,
    drawing_data: dict[str, Any],
    title_block_data: TitleBlockData | None,
    scale_str: str,
) -> None:
    """Draw the title block at the bottom of the page."""
    coords = get_title_block_coords(paper_size)

    # Title block border
    bl = coords["border_bl"]
    tr = coords["border_tr"]
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.5)
    c.rect(
        bl[0] * mm, bl[1] * mm,
        (tr[0] - bl[0]) * mm, (tr[1] - bl[1]) * mm,
    )

    # Dividers
    d1 = coords["divider_1"]
    d1t = coords["divider_1_top"]
    c.line(d1[0] * mm, d1[1] * mm, d1t[0] * mm, d1t[1] * mm)

    d2 = coords["divider_2"]
    d2t = coords["divider_2_top"]
    c.line(d2[0] * mm, d2[1] * mm, d2t[0] * mm, d2t[1] * mm)

    tb = title_block_data or TitleBlockData()

    # Company section
    pos = coords["company_name"]
    c.setFont("Helvetica-Bold", 10)
    c.drawString(pos[0] * mm, pos[1] * mm, tb.company_name)

    pos = coords["company_tagline"]
    c.setFont("Helvetica", 6)
    c.drawString(pos[0] * mm, pos[1] * mm, tb.company_tagline)

    pos = coords["project_name"]
    c.setFont("Helvetica-Bold", 7)
    project_name = tb.project_name or drawing_data.get("project_id", "")
    c.drawString(pos[0] * mm, pos[1] * mm, f"Project: {project_name}")

    pos = coords["project_id"]
    c.setFont("Helvetica", 6)
    c.drawString(pos[0] * mm, pos[1] * mm, f"ID: {drawing_data.get('project_id', '')}")

    # Drawing section
    pos = coords["drawing_title"]
    c.setFont("Helvetica-Bold", 9)
    drawing_title = drawing_data.get("drawing_types", ["Floor Plan"])[0].replace("_", " ").title()
    c.drawString(pos[0] * mm, pos[1] * mm, drawing_title)

    pos = coords["drawing_number"]
    c.setFont("Helvetica", 7)
    c.drawString(pos[0] * mm, pos[1] * mm, f"Dwg: {drawing_data.get('drawing_id', '')[:12]}")

    pos = coords["room_name"]
    c.setFont("Helvetica", 7)
    c.drawString(pos[0] * mm, pos[1] * mm, f"Room: {drawing_data.get('room_name', '')}")

    # Info section
    c.setFont("Helvetica", 6)

    pos = coords["scale_label"]
    c.drawString(pos[0] * mm, pos[1] * mm, "Scale:")
    pos = coords["scale_value"]
    c.setFont("Helvetica-Bold", 7)
    c.drawString(pos[0] * mm, pos[1] * mm, scale_str)

    c.setFont("Helvetica", 6)
    pos = coords["date_label"]
    c.drawString(pos[0] * mm, pos[1] * mm, "Date:")
    pos = coords["date_value"]
    c.drawString(pos[0] * mm, pos[1] * mm, tb.date)

    pos = coords["revision_label"]
    c.drawString(pos[0] * mm, pos[1] * mm, "Rev:")
    pos = coords["revision_value"]
    c.drawString(pos[0] * mm, pos[1] * mm, tb.revision)

    pos = coords["drawn_label"]
    c.drawString(pos[0] * mm, pos[1] * mm, "Drawn:")
    pos = coords["drawn_value"]
    c.drawString(pos[0] * mm, pos[1] * mm, tb.drawn_by)


# -- Entity rendering helpers ----------------------------------------------

def _set_layer_style(c: canvas.Canvas, layer: str) -> None:
    """Set stroke colour and linewidth for a layer."""
    r, g, b = LAYER_COLORS.get(layer, (0, 0, 0))
    c.setStrokeColorRGB(r, g, b)
    c.setLineWidth(LAYER_LINEWIDTHS.get(layer, 0.25))


def _pdf_draw_walls(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any,
) -> None:
    """Draw walls on the PDF."""
    walls = data.get("entities", {}).get("walls", [])

    for wall in walls:
        start = wall["start"]
        end = wall["end"]
        thickness = wall.get("thickness", 150)
        layer = "A-WALL" if wall.get("wall_type") == "external" else "A-WALL-INT"
        _set_layer_style(c, layer)

        p1 = to_page(start[0], start[1])
        p2 = to_page(end[0], end[1])
        c.line(p1[0], p1[1], p2[0], p2[1])

        # Outer wall line
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.sqrt(dx * dx + dy * dy)
        if length > 0:
            nx = -dy / length * thickness
            ny = dx / length * thickness
            p3 = to_page(start[0] + nx, start[1] + ny)
            p4 = to_page(end[0] + nx, end[1] + ny)
            c.line(p3[0], p3[1], p4[0], p4[1])

            # End caps
            c.line(p1[0], p1[1], p3[0], p3[1])
            c.line(p2[0], p2[1], p4[0], p4[1])


def _pdf_draw_doors(
    c: canvas.Canvas, data: dict[str, Any], to_page: Any,
) -> None:
    """Draw doors on the PDF."""
    _set_layer_style(c, "A-DOOR")
    doors = data.get("entities", {}).get("doors", [])

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

        hx = ws[0] + ux * offset
        hy = ws[1] + uy * offset

        nx = -uy
        ny = ux
        leaf_end_x = hx + nx * width
        leaf_end_y = hy + ny * width

        p1 = to_page(hx, hy)
        p2 = to_page(leaf_end_x, leaf_end_y)
        c.line(p1[0], p1[1], p2[0], p2[1])

        # Quarter arc
        p_centre = to_page(hx, hy)
        r_pts = width * abs(to_page(1, 0)[0] - to_page(0, 0)[0])
        start_angle = math.degrees(math.atan2(uy, ux))
        end_angle = math.degrees(math.atan2(ny, nx))
        c.arc(
            p_centre[0] - r_pts, p_centre[1] - r_pts,
            p_centre[0] + r_pts, p_centre[1] + r_pts,
            startAng=start_angle, extent=end_angle - start_angle,
        )


def _pdf_draw_windows(
    c: canvas.Canvas, data: dict[str, Any], to_page: Any,
) -> None:
    """Draw windows on the PDF."""
    _set_layer_style(c, "A-GLAZ")
    windows = data.get("entities", {}).get("windows", [])

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
            p1 = to_page(w_sx + nx, w_sy + ny)
            p2 = to_page(w_ex + nx, w_ey + ny)
            c.line(p1[0], p1[1], p2[0], p2[1])


def _pdf_draw_furniture(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw furniture rectangles on the PDF."""
    _set_layer_style(c, "I-FURN")
    furniture = data.get("entities", {}).get("furniture", [])

    for item in furniture:
        pos = item["position"]
        w = item["width"]
        d = item["depth"]
        rotation = item.get("rotation", 0)
        name = item.get("name", "")

        if rotation in (90, 270):
            w, d = d, w

        p = to_page(pos[0], pos[1])
        pw = w * scale * mm
        pd = d * scale * mm

        c.rect(p[0], p[1], pw, pd)

        # Cross lines
        _set_layer_style(c, "I-FURN-OUTL")
        c.line(p[0], p[1], p[0] + pw, p[1] + pd)
        c.line(p[0] + pw, p[1], p[0], p[1] + pd)

        # Label
        c.setFont("Helvetica", max(4, min(7, pw * 0.1)))
        c.setFillColorRGB(0, 0.5, 0)
        c.drawCentredString(p[0] + pw / 2, p[1] + pd / 2, name.upper())
        c.setFillColor(colors.black)


def _pdf_draw_electrical(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw electrical symbols on the PDF."""
    electrical = data.get("entities", {}).get("electrical", [])

    for point in electrical:
        pos = point["position"]
        elec_type = point.get("elec_type", "socket")
        p = to_page(pos[0], pos[1])
        r = 100 * scale * mm

        if elec_type in ("light", "fan"):
            _set_layer_style(c, "E-LITE")
            c.circle(p[0], p[1], r, stroke=1, fill=0)
            c.line(p[0] - r * 0.7, p[1], p[0] + r * 0.7, p[1])
            c.line(p[0], p[1] - r * 0.7, p[0], p[1] + r * 0.7)
        elif elec_type == "switch":
            _set_layer_style(c, "E-POWR")
            s = 60 * scale * mm
            c.rect(p[0] - s, p[1] - s, 2 * s, 2 * s)
            c.setFont("Helvetica-Bold", max(3, s * 1.5))
            c.drawCentredString(p[0], p[1] - s * 0.3, "S")
        else:
            _set_layer_style(c, "E-POWR")
            c.circle(p[0], p[1], r * 0.5, stroke=1, fill=0)
            c.line(p[0] - r * 0.5, p[1], p[0] + r * 0.5, p[1])


def _pdf_draw_ceiling(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw ceiling elements on the PDF."""
    analysis = data.get("analysis", {})
    ceiling_type = analysis.get("ceiling_type", "none")

    if ceiling_type == "none":
        return

    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    _set_layer_style(c, "A-CLNG")

    # Room outline (dashed)
    c.setDash(3, 2)
    p1 = to_page(0, 0)
    p2 = to_page(length_mm, width_mm)
    c.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])
    c.setDash()

    if ceiling_type == "peripheral":
        inset = 300
        p3 = to_page(inset, inset)
        p4 = to_page(length_mm - inset, width_mm - inset)
        c.rect(p3[0], p3[1], p4[0] - p3[0], p4[1] - p3[1])


def _pdf_draw_flooring(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw flooring tile grid on the PDF."""
    flooring = data.get("entities", {}).get("flooring", [{}])
    if not flooring:
        return

    floor_data = flooring[0]
    tile_size = floor_data.get("tile_size", [600, 600])
    tile_w = tile_size[0]
    tile_h = tile_size[1]

    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    _set_layer_style(c, "I-FLOR-PATT")

    x = 0.0
    while x <= length_mm:
        p1 = to_page(x, 0)
        p2 = to_page(x, width_mm)
        c.line(p1[0], p1[1], p2[0], p2[1])
        x += tile_w

    y = 0.0
    while y <= width_mm:
        p1 = to_page(0, y)
        p2 = to_page(length_mm, y)
        c.line(p1[0], p1[1], p2[0], p2[1])
        y += tile_h


def _pdf_draw_elevation(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw an elevation view on the PDF."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    height_mm = dims.get("height_mm", 2700)

    _set_layer_style(c, "A-WALL")

    # Room outline
    p1 = to_page(0, 0)
    p2 = to_page(length_mm, height_mm)
    c.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])

    # Windows
    _set_layer_style(c, "A-GLAZ")
    windows = data.get("entities", {}).get("windows", [])
    for window in windows:
        w_offset = window["offset"]
        w_width = window["width"]
        w_height = window.get("height", 1200)
        w_sill = window.get("sill", 900)

        wp1 = to_page(w_offset, w_sill)
        wp2 = to_page(w_offset + w_width, w_sill + w_height)
        c.rect(wp1[0], wp1[1], wp2[0] - wp1[0], wp2[1] - wp1[1])


def _pdf_draw_section(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw a section view on the PDF."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    height_mm = dims.get("height_mm", 2700)

    _set_layer_style(c, "A-SECT")

    # Floor slab
    t = 150
    p1 = to_page(-t, -t)
    p2 = to_page(length_mm + t, 0)
    c.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])

    # Ceiling slab
    p1 = to_page(-t, height_mm)
    p2 = to_page(length_mm + t, height_mm + t)
    c.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])

    # Left wall
    p1 = to_page(-t, 0)
    p2 = to_page(0, height_mm)
    c.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])

    # Right wall
    p1 = to_page(length_mm, 0)
    p2 = to_page(length_mm + t, height_mm)
    c.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])

    # Room outline
    _set_layer_style(c, "A-WALL")
    p1 = to_page(0, 0)
    p2 = to_page(length_mm, height_mm)
    c.rect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])


# -- Dimensions and labels --------------------------------------------------

def _pdf_draw_dimensions(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw dimension lines on the PDF."""
    _set_layer_style(c, "A-ANNO-DIMS")
    dimensions = data.get("dimensions", [])

    for dim in dimensions:
        start = dim.get("start", (0, 0))
        end = dim.get("end", (0, 0))
        text = dim.get("text", "")
        offset_val = dim.get("offset_mm", 500)

        p1 = to_page(start[0], start[1])
        p2 = to_page(end[0], end[1])

        direction = dim.get("direction", "horizontal")

        if direction == "horizontal":
            y_off = offset_val * scale * mm
            c.line(p1[0], p1[1] + y_off, p2[0], p2[1] + y_off)
            # Extension lines
            c.line(p1[0], p1[1], p1[0], p1[1] + y_off + 1 * mm)
            c.line(p2[0], p2[1], p2[0], p2[1] + y_off + 1 * mm)
            # Text
            c.setFont("Helvetica", 5)
            mid_x = (p1[0] + p2[0]) / 2
            c.drawCentredString(mid_x, p1[1] + y_off + 1 * mm, text)
        elif direction == "vertical":
            x_off = offset_val * scale * mm
            c.line(p1[0] + x_off, p1[1], p2[0] + x_off, p2[1])
            c.line(p1[0], p1[1], p1[0] + x_off + 1 * mm, p1[1])
            c.line(p2[0], p2[1], p2[0] + x_off + 1 * mm, p2[1])
            c.setFont("Helvetica", 5)
            mid_y = (p1[1] + p2[1]) / 2
            c.saveState()
            c.translate(p1[0] + x_off + 2 * mm, mid_y)
            c.rotate(90)
            c.drawCentredString(0, 0, text)
            c.restoreState()


def _pdf_draw_room_label(
    c: canvas.Canvas, data: dict[str, Any],
    to_page: Any, scale: float,
) -> None:
    """Draw the room name label."""
    dims = data.get("room_dimensions", {})
    length_mm = dims.get("length_mm", 3000)
    width_mm = dims.get("width_mm", 3000)

    room_name = data.get("room_name", "Room")
    area_sqft = (length_mm * width_mm) / (304.8 * 304.8)

    centre = to_page(length_mm / 2, width_mm / 2)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColorRGB(0.2, 0.2, 0.2)
    c.drawCentredString(centre[0], centre[1] + 3 * mm, room_name)
    c.setFont("Helvetica", 6)
    c.drawCentredString(centre[0], centre[1] - 3 * mm, f"{area_sqft:.0f} sqft")
    c.setFillColor(colors.black)


def _pdf_draw_notes(
    c: canvas.Canvas, data: dict[str, Any], paper_size: str,
) -> None:
    """Draw general notes on the PDF."""
    notes = data.get("annotations", {}).get("notes", [])
    if not notes:
        return

    pw, ph = get_paper_dimensions(paper_size)
    margin = TITLE_BLOCK_MARGIN_MM
    tb_height = TITLE_BLOCK_HEIGHT_MM

    # Notes go in the top-right corner
    note_x = (pw - margin - 100) * mm
    note_y = (ph - margin - 10) * mm

    c.setFont("Helvetica-Bold", 6)
    c.drawString(note_x, note_y, "NOTES:")

    c.setFont("Helvetica", 5)
    for idx, note in enumerate(notes):
        c.drawString(note_x, note_y - (idx + 1) * 8, note)
