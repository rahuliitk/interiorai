"""
Drawing title block template for PDF and DXF output.

Provides a standard A3/A4 title block with company name, project info,
drawing details, scale, and revision information.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class TitleBlockData:
    """Data to populate a drawing title block."""

    company_name: str = "OpenLintel"
    company_tagline: str = "AI-Powered Interior Design Platform"
    project_name: str = ""
    project_id: str = ""
    client_name: str = ""
    drawing_title: str = ""
    drawing_number: str = ""
    drawing_type: str = ""
    room_name: str = ""
    scale: str = "1:50"
    paper_size: str = "A3"
    revision: str = "R0"
    date: str = field(default_factory=lambda: datetime.now(tz=timezone.utc).strftime("%Y-%m-%d"))
    drawn_by: str = "OpenLintel AI"
    checked_by: str = ""
    approved_by: str = ""
    notes: list[str] = field(default_factory=list)


# Paper sizes in mm (width x height, landscape orientation)
PAPER_SIZES: dict[str, tuple[float, float]] = {
    "A4": (297.0, 210.0),
    "A3": (420.0, 297.0),
    "A2": (594.0, 420.0),
    "A1": (841.0, 594.0),
    "A0": (1189.0, 841.0),
}

# Title block dimensions (relative to paper, landscape)
TITLE_BLOCK_HEIGHT_MM = 40.0
TITLE_BLOCK_MARGIN_MM = 10.0


def get_paper_dimensions(paper_size: str) -> tuple[float, float]:
    """Return paper dimensions (width, height) in mm for landscape orientation.

    Parameters
    ----------
    paper_size:
        Paper size string (A0-A4).

    Returns
    -------
    tuple[float, float]
        Width and height in mm.
    """
    return PAPER_SIZES.get(paper_size.upper(), PAPER_SIZES["A3"])


def get_drawing_area(paper_size: str) -> tuple[float, float, float, float]:
    """Return the drawable area coordinates in mm (x_min, y_min, x_max, y_max).

    Accounts for the margin border and title block at the bottom.

    Parameters
    ----------
    paper_size:
        Paper size string.

    Returns
    -------
    tuple[float, float, float, float]
        (x_min, y_min, x_max, y_max) of the drawable area in mm.
    """
    pw, ph = get_paper_dimensions(paper_size)
    margin = TITLE_BLOCK_MARGIN_MM
    tb_height = TITLE_BLOCK_HEIGHT_MM

    x_min = margin
    y_min = margin + tb_height
    x_max = pw - margin
    y_max = ph - margin

    return (x_min, y_min, x_max, y_max)


def get_title_block_coords(paper_size: str) -> dict[str, tuple[float, float]]:
    """Return key coordinate positions within the title block.

    Parameters
    ----------
    paper_size:
        Paper size string.

    Returns
    -------
    dict
        Named positions for title block elements.
    """
    pw, ph = get_paper_dimensions(paper_size)
    margin = TITLE_BLOCK_MARGIN_MM
    tb_height = TITLE_BLOCK_HEIGHT_MM

    # Title block spans the full width at the bottom
    tb_left = margin
    tb_right = pw - margin
    tb_bottom = margin
    tb_top = margin + tb_height

    # Title block is divided into sections
    # Left section (40%): Company info
    # Middle section (35%): Drawing info
    # Right section (25%): Scale, date, revision
    section_1 = tb_left + (tb_right - tb_left) * 0.40
    section_2 = tb_left + (tb_right - tb_left) * 0.75

    return {
        "border_bl": (tb_left, tb_bottom),
        "border_tr": (tb_right, tb_top),
        "divider_1": (section_1, tb_bottom),
        "divider_1_top": (section_1, tb_top),
        "divider_2": (section_2, tb_bottom),
        "divider_2_top": (section_2, tb_top),
        # Company section
        "company_name": (tb_left + 5, tb_top - 12),
        "company_tagline": (tb_left + 5, tb_top - 20),
        "project_name": (tb_left + 5, tb_top - 30),
        "project_id": (tb_left + 5, tb_top - 37),
        # Drawing section
        "drawing_title": (section_1 + 5, tb_top - 12),
        "drawing_number": (section_1 + 5, tb_top - 22),
        "room_name": (section_1 + 5, tb_top - 32),
        # Info section
        "scale_label": (section_2 + 5, tb_top - 8),
        "scale_value": (section_2 + 40, tb_top - 8),
        "date_label": (section_2 + 5, tb_top - 16),
        "date_value": (section_2 + 40, tb_top - 16),
        "revision_label": (section_2 + 5, tb_top - 24),
        "revision_value": (section_2 + 40, tb_top - 24),
        "drawn_label": (section_2 + 5, tb_top - 32),
        "drawn_value": (section_2 + 40, tb_top - 32),
    }


def calculate_scale_factor(
    room_length_mm: float,
    room_width_mm: float,
    paper_size: str = "A3",
    target_scale: str = "1:50",
) -> tuple[float, str]:
    """Calculate the optimal drawing scale to fit a room on paper.

    If the specified target scale does not fit, an appropriate scale is
    automatically selected.

    Parameters
    ----------
    room_length_mm:
        Room length in mm.
    room_width_mm:
        Room width in mm.
    paper_size:
        Target paper size.
    target_scale:
        Desired scale string (e.g. ``"1:50"``).

    Returns
    -------
    tuple[float, str]
        (scale_factor, scale_string) where scale_factor is the multiplier
        to convert mm to drawing units.
    """
    standard_scales = [
        ("1:10", 1 / 10),
        ("1:20", 1 / 20),
        ("1:25", 1 / 25),
        ("1:50", 1 / 50),
        ("1:75", 1 / 75),
        ("1:100", 1 / 100),
        ("1:200", 1 / 200),
    ]

    x_min, y_min, x_max, y_max = get_drawing_area(paper_size)
    available_width = x_max - x_min
    available_height = y_max - y_min

    # Add margin for dimensions and annotations (15% each side)
    usable_width = available_width * 0.7
    usable_height = available_height * 0.7

    # Try the target scale first
    target_parts = target_scale.split(":")
    if len(target_parts) == 2:
        try:
            target_factor = float(target_parts[0]) / float(target_parts[1])
            drawn_length = room_length_mm * target_factor
            drawn_width = room_width_mm * target_factor

            if drawn_length <= usable_width and drawn_width <= usable_height:
                return target_factor, target_scale
            # Try rotated
            if drawn_width <= usable_width and drawn_length <= usable_height:
                return target_factor, target_scale
        except ValueError:
            pass

    # Auto-select the largest scale that fits
    for scale_str, scale_factor in standard_scales:
        drawn_length = room_length_mm * scale_factor
        drawn_width = room_width_mm * scale_factor

        fits_normal = drawn_length <= usable_width and drawn_width <= usable_height
        fits_rotated = drawn_width <= usable_width and drawn_length <= usable_height

        if fits_normal or fits_rotated:
            return scale_factor, scale_str

    # Fallback to 1:200
    return 1 / 200, "1:200"
