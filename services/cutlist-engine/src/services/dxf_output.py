"""
DXF output service for CNC-ready cut sheets.

Generates DXF files using ezdxf with accurate panel outlines, cut lines,
labels, and grain direction indicators suitable for CNC router import.
"""

from __future__ import annotations

import io

import ezdxf
import structlog
from ezdxf import units
from ezdxf.document import Drawing
from ezdxf.layouts import Modelspace

from src.models.nesting import NestingResult, PlacedPanel, SheetLayout

logger = structlog.get_logger(__name__)

# Layer names for DXF organization
LAYER_SHEET_OUTLINE = "SHEET_OUTLINE"
LAYER_CUT_LINES = "CUT_LINES"
LAYER_LABELS = "LABELS"
LAYER_GRAIN = "GRAIN_DIRECTION"
LAYER_DIMENSIONS = "DIMENSIONS"

# DXF colors (AutoCAD Color Index)
COLOR_SHEET = 8       # Grey
COLOR_CUT = 1         # Red
COLOR_LABEL = 7       # White
COLOR_GRAIN = 3       # Green
COLOR_DIMENSION = 4   # Cyan


def _setup_layers(doc: Drawing) -> None:
    """Create standard layers in the DXF document."""
    doc.layers.add(LAYER_SHEET_OUTLINE, color=COLOR_SHEET)
    doc.layers.add(LAYER_CUT_LINES, color=COLOR_CUT)
    doc.layers.add(LAYER_LABELS, color=COLOR_LABEL)
    doc.layers.add(LAYER_GRAIN, color=COLOR_GRAIN)
    doc.layers.add(LAYER_DIMENSIONS, color=COLOR_DIMENSION)


def _draw_sheet_outline(
    msp: Modelspace,
    sheet: SheetLayout,
    x_offset: float,
    y_offset: float,
) -> None:
    """Draw the outer boundary of a sheet."""
    points = [
        (x_offset, y_offset),
        (x_offset + sheet.sheet_length_mm, y_offset),
        (x_offset + sheet.sheet_length_mm, y_offset + sheet.sheet_width_mm),
        (x_offset, y_offset + sheet.sheet_width_mm),
        (x_offset, y_offset),
    ]
    msp.add_lwpolyline(
        points,
        dxfattribs={"layer": LAYER_SHEET_OUTLINE},
    )

    # Sheet label
    msp.add_text(
        f"Sheet {sheet.sheet_index + 1} — {sheet.material} {sheet.thickness_mm}mm "
        f"({sheet.utilization_percentage:.1f}% utilization)",
        dxfattribs={
            "layer": LAYER_LABELS,
            "height": 30,
        },
    ).set_placement(
        (x_offset + 10, y_offset + sheet.sheet_width_mm + 15),
    )


def _draw_panel(
    msp: Modelspace,
    panel: PlacedPanel,
    x_offset: float,
    y_offset: float,
) -> None:
    """Draw a single panel with cut lines, label, and grain indicator."""
    px = x_offset + panel.x_mm
    py = y_offset + panel.y_mm

    if panel.rotated:
        pw = panel.width_mm
        ph = panel.length_mm
    else:
        pw = panel.length_mm
        ph = panel.width_mm

    # Cut line rectangle
    cut_points = [
        (px, py),
        (px + pw, py),
        (px + pw, py + ph),
        (px, py + ph),
        (px, py),
    ]
    msp.add_lwpolyline(
        cut_points,
        dxfattribs={"layer": LAYER_CUT_LINES},
    )

    # Panel label (centered in the panel)
    label_x = px + pw / 2
    label_y = py + ph / 2
    label_height = min(pw, ph) * 0.08
    label_height = max(label_height, 8)
    label_height = min(label_height, 25)

    msp.add_text(
        panel.part_name,
        dxfattribs={
            "layer": LAYER_LABELS,
            "height": label_height,
        },
    ).set_placement(
        (label_x, label_y),
        align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
    )

    # Dimension label below part name
    dim_text = f"{panel.length_mm:.0f} x {panel.width_mm:.0f}"
    msp.add_text(
        dim_text,
        dxfattribs={
            "layer": LAYER_DIMENSIONS,
            "height": label_height * 0.7,
        },
    ).set_placement(
        (label_x, label_y - label_height * 1.5),
        align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
    )

    # Grain direction arrow
    if panel.grain_direction_on_sheet != "none":
        _draw_grain_arrow(msp, px, py, pw, ph, panel.grain_direction_on_sheet)


def _draw_grain_arrow(
    msp: Modelspace,
    px: float,
    py: float,
    pw: float,
    ph: float,
    direction: str,
) -> None:
    """Draw a small arrow indicating grain direction inside the panel."""
    margin = min(pw, ph) * 0.1
    arrow_len = min(pw, ph) * 0.3

    if direction == "horizontal":
        start_x = px + margin
        start_y = py + margin
        end_x = start_x + arrow_len
        end_y = start_y
        # Arrow head
        head_size = arrow_len * 0.2
        msp.add_line(
            (start_x, start_y),
            (end_x, end_y),
            dxfattribs={"layer": LAYER_GRAIN},
        )
        msp.add_line(
            (end_x, end_y),
            (end_x - head_size, end_y + head_size * 0.5),
            dxfattribs={"layer": LAYER_GRAIN},
        )
        msp.add_line(
            (end_x, end_y),
            (end_x - head_size, end_y - head_size * 0.5),
            dxfattribs={"layer": LAYER_GRAIN},
        )
    else:
        start_x = px + margin
        start_y = py + margin
        end_x = start_x
        end_y = start_y + arrow_len
        head_size = arrow_len * 0.2
        msp.add_line(
            (start_x, start_y),
            (end_x, end_y),
            dxfattribs={"layer": LAYER_GRAIN},
        )
        msp.add_line(
            (end_x, end_y),
            (end_x + head_size * 0.5, end_y - head_size),
            dxfattribs={"layer": LAYER_GRAIN},
        )
        msp.add_line(
            (end_x, end_y),
            (end_x - head_size * 0.5, end_y - head_size),
            dxfattribs={"layer": LAYER_GRAIN},
        )


def generate_dxf(nesting_result: NestingResult) -> bytes:
    """Generate a CNC-ready DXF file from a nesting result.

    Each sheet is laid out horizontally with spacing between sheets.
    All panels are drawn with cut lines on a dedicated layer, labels
    for identification, and grain direction arrows.

    Parameters
    ----------
    nesting_result:
        The complete nesting layout from the bin-packing algorithm.

    Returns
    -------
    bytes
        The DXF file content as bytes.
    """
    doc = ezdxf.new("R2010")
    doc.units = units.MM
    _setup_layers(doc)

    msp = doc.modelspace()

    # Spacing between sheets in the DXF layout
    sheet_spacing = 100.0
    y_offset = 0.0

    for sheet in nesting_result.sheets:
        _draw_sheet_outline(msp, sheet, x_offset=0, y_offset=y_offset)

        for panel in sheet.panels:
            _draw_panel(msp, panel, x_offset=0, y_offset=y_offset)

        y_offset += sheet.sheet_width_mm + sheet_spacing

    # Write to bytes
    buffer = io.BytesIO()
    doc.write(buffer)
    buffer.seek(0)

    logger.info(
        "dxf_generated",
        cutlist_id=nesting_result.cutlist_id,
        sheets=len(nesting_result.sheets),
        file_size_bytes=buffer.getbuffer().nbytes,
    )

    return buffer.read()


def generate_single_sheet_dxf(sheet: SheetLayout) -> bytes:
    """Generate a DXF file for a single sheet layout.

    Parameters
    ----------
    sheet:
        A single sheet layout to render.

    Returns
    -------
    bytes
        The DXF file content as bytes.
    """
    doc = ezdxf.new("R2010")
    doc.units = units.MM
    _setup_layers(doc)

    msp = doc.modelspace()

    _draw_sheet_outline(msp, sheet, x_offset=0, y_offset=0)
    for panel in sheet.panels:
        _draw_panel(msp, panel, x_offset=0, y_offset=0)

    buffer = io.BytesIO()
    doc.write(buffer)
    buffer.seek(0)
    return buffer.read()
