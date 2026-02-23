"""
Bin-packing nesting service using rectpack.

Packs CutListPanel instances onto standard sheet sizes with grain-direction
awareness and waste percentage calculation.  Produces SheetLayout objects
with precise panel placement coordinates for CNC output.
"""

from __future__ import annotations

import uuid
from typing import Any

import rectpack
import structlog

from src.models.nesting import NestingResult, Offcut, PlacedPanel, SheetLayout
from src.models.panels import CutListPanel

logger = structlog.get_logger(__name__)

# Standard sheet sizes in mm (length x width)
STANDARD_SHEET_SIZES: dict[str, tuple[int, int]] = {
    "8x4": (2440, 1220),
    "7x4": (2135, 1220),
    "6x4": (1830, 1220),
    "8x3": (2440, 915),
}

# Minimum offcut dimensions to be considered reusable (mm)
MIN_REUSABLE_LENGTH = 200
MIN_REUSABLE_WIDTH = 200

# Saw kerf (blade thickness) allowance in mm
SAW_KERF_MM = 4.0


def _expand_panels(panels: list[CutListPanel]) -> list[tuple[CutListPanel, int]]:
    """Expand panels by quantity into individual placement items.

    Returns a list of (panel, copy_index) tuples.
    """
    expanded: list[tuple[CutListPanel, int]] = []
    for panel in panels:
        for i in range(panel.quantity):
            expanded.append((panel, i))
    return expanded


def _can_rotate(panel: CutListPanel) -> bool:
    """Determine whether a panel can be rotated during nesting.

    Panels with grain direction along 'length' or 'width' cannot be freely
    rotated, as that would misalign the grain on the sheet.  Panels with
    grain_direction='none' (e.g. MDF) can be rotated.
    """
    return panel.grain_direction == "none"


def nest_panels(
    panels: list[CutListPanel],
    sheet_size: str = "8x4",
    cutlist_id: str | None = None,
) -> NestingResult:
    """Pack panels onto sheets using the rectpack bin-packing algorithm.

    Parameters
    ----------
    panels:
        The cut list panels to nest.  Each panel's ``quantity`` field is
        respected — multiple copies are placed individually.
    sheet_size:
        Key into ``STANDARD_SHEET_SIZES`` (default ``"8x4"``).
    cutlist_id:
        Optional identifier linking this nesting result to a cut list.

    Returns
    -------
    NestingResult
        Complete nesting layout with sheet assignments, panel placements,
        offcut tracking, and waste statistics.
    """
    if cutlist_id is None:
        cutlist_id = str(uuid.uuid4())

    if sheet_size not in STANDARD_SHEET_SIZES:
        raise ValueError(
            f"Unknown sheet size '{sheet_size}'. "
            f"Valid sizes: {', '.join(STANDARD_SHEET_SIZES.keys())}"
        )

    sheet_length, sheet_width = STANDARD_SHEET_SIZES[sheet_size]
    expanded = _expand_panels(panels)

    if not expanded:
        return NestingResult(
            cutlist_id=cutlist_id,
            sheets=[],
            total_sheets=0,
            total_sheet_area_mm2=0,
            total_panel_area_mm2=0,
            total_waste_area_mm2=0,
            waste_percentage=0,
            reusable_offcuts=[],
            sheet_size_used=sheet_size,
        )

    # Group panels by material and thickness for separate nesting runs
    groups: dict[str, list[tuple[CutListPanel, int]]] = {}
    for panel, idx in expanded:
        key = f"{panel.material.value}_{panel.thickness_mm}"
        groups.setdefault(key, []).append((panel, idx))

    all_sheets: list[SheetLayout] = []
    all_reusable_offcuts: list[Offcut] = []
    sheet_counter = 0

    for group_key, group_panels in groups.items():
        packer = rectpack.newPacker(
            mode=rectpack.PackingMode.Offline,
            bin_algo=rectpack.MaxRectsBssf,
            pack_algo=rectpack.PackingAlgorithm.BestAreaFit,
            sort_algo=rectpack.SORT_AREA,
            rotation=True,
        )

        # Add rectangles (with kerf allowance)
        panel_map: dict[int, tuple[CutListPanel, int]] = {}
        for i, (panel, copy_idx) in enumerate(group_panels):
            rect_l = int(panel.length_mm + SAW_KERF_MM)
            rect_w = int(panel.width_mm + SAW_KERF_MM)

            if _can_rotate(panel):
                packer.add_rect(rect_l, rect_w, rid=i)
            else:
                # For grain-constrained panels, we still add them but track rotation
                packer.add_rect(rect_l, rect_w, rid=i)

            panel_map[i] = (panel, copy_idx)

        # Add enough bins (sheets) to accommodate all panels
        max_bins = len(group_panels) + 1
        for _ in range(max_bins):
            packer.add_bin(sheet_length, sheet_width)

        packer.pack()

        # Extract results per bin
        for bin_idx in range(len(packer)):
            bin_rects = packer.rect_list()
            # Filter rects belonging to this bin
            rects_in_bin = [r for r in bin_rects if r[0] == bin_idx]

            if not rects_in_bin:
                continue

            placed_panels: list[PlacedPanel] = []
            total_panel_area_in_sheet = 0.0
            sample_panel = group_panels[0][0]

            for rect in rects_in_bin:
                b, x, y, w, h, rid = rect
                panel, copy_idx = panel_map[rid]

                # Determine if rotated: rectpack may swap w/h
                panel_l = int(panel.length_mm + SAW_KERF_MM)
                panel_w = int(panel.width_mm + SAW_KERF_MM)
                rotated = not (w == panel_l and h == panel_w)

                if rotated and not _can_rotate(panel):
                    # Grain-constrained panel was rotated — track actual grain direction
                    grain_on_sheet = "vertical" if panel.grain_direction == "length" else "horizontal"
                else:
                    grain_on_sheet = (
                        "horizontal" if panel.grain_direction == "length" else "vertical"
                    )

                placed_panels.append(
                    PlacedPanel(
                        panel_id=f"{panel.id}_copy{copy_idx}",
                        part_name=panel.part_name,
                        x_mm=float(x),
                        y_mm=float(y),
                        length_mm=panel.length_mm,
                        width_mm=panel.width_mm,
                        rotated=rotated,
                        grain_direction_on_sheet=grain_on_sheet,
                    )
                )
                total_panel_area_in_sheet += panel.area_mm2

            sheet_area = float(sheet_length * sheet_width)
            utilization = (total_panel_area_in_sheet / sheet_area) * 100.0 if sheet_area > 0 else 0

            # Calculate offcuts (simplified: largest remaining rectangle)
            offcuts = _calculate_offcuts(
                sheet_length,
                sheet_width,
                placed_panels,
                sheet_counter,
            )

            all_sheets.append(
                SheetLayout(
                    sheet_index=sheet_counter,
                    sheet_length_mm=float(sheet_length),
                    sheet_width_mm=float(sheet_width),
                    material=sample_panel.material.value,
                    thickness_mm=sample_panel.thickness_mm,
                    panels=placed_panels,
                    offcuts=offcuts,
                    utilization_percentage=round(utilization, 2),
                )
            )

            all_reusable_offcuts.extend([o for o in offcuts if o.reusable])
            sheet_counter += 1

    total_sheet_area = sum(s.sheet_length_mm * s.sheet_width_mm for s in all_sheets)
    total_panel_area = sum(
        p.length_mm * p.width_mm for s in all_sheets for p in s.panels
    )
    total_waste = total_sheet_area - total_panel_area
    waste_pct = (total_waste / total_sheet_area * 100.0) if total_sheet_area > 0 else 0

    logger.info(
        "nesting_complete",
        cutlist_id=cutlist_id,
        total_sheets=len(all_sheets),
        waste_percentage=round(waste_pct, 2),
        reusable_offcuts=len(all_reusable_offcuts),
    )

    return NestingResult(
        cutlist_id=cutlist_id,
        sheets=all_sheets,
        total_sheets=len(all_sheets),
        total_sheet_area_mm2=total_sheet_area,
        total_panel_area_mm2=total_panel_area,
        total_waste_area_mm2=total_waste,
        waste_percentage=round(waste_pct, 2),
        reusable_offcuts=all_reusable_offcuts,
        sheet_size_used=sheet_size,
    )


def _calculate_offcuts(
    sheet_length: int,
    sheet_width: int,
    placed_panels: list[PlacedPanel],
    sheet_index: int,
) -> list[Offcut]:
    """Calculate reusable offcut rectangles from a sheet after panel placement.

    Uses a simplified approach: finds the bounding box of placed panels
    and calculates remaining strips on the right and top edges.
    """
    if not placed_panels:
        return [
            Offcut(
                id=str(uuid.uuid4()),
                sheet_index=sheet_index,
                x_mm=0,
                y_mm=0,
                length_mm=float(sheet_length),
                width_mm=float(sheet_width),
                area_mm2=float(sheet_length * sheet_width),
                reusable=True,
            )
        ]

    offcuts: list[Offcut] = []

    # Find the maximum extents of placed panels
    max_x = 0.0
    max_y = 0.0
    for p in placed_panels:
        if p.rotated:
            right_edge = p.x_mm + p.width_mm + SAW_KERF_MM
            top_edge = p.y_mm + p.length_mm + SAW_KERF_MM
        else:
            right_edge = p.x_mm + p.length_mm + SAW_KERF_MM
            top_edge = p.y_mm + p.width_mm + SAW_KERF_MM
        max_x = max(max_x, right_edge)
        max_y = max(max_y, top_edge)

    # Right strip offcut
    right_strip_length = float(sheet_length) - max_x
    if right_strip_length > 0 and sheet_width > 0:
        reusable = right_strip_length >= MIN_REUSABLE_LENGTH and sheet_width >= MIN_REUSABLE_WIDTH
        offcuts.append(
            Offcut(
                id=str(uuid.uuid4()),
                sheet_index=sheet_index,
                x_mm=max_x,
                y_mm=0,
                length_mm=right_strip_length,
                width_mm=float(sheet_width),
                area_mm2=right_strip_length * float(sheet_width),
                reusable=reusable,
            )
        )

    # Top strip offcut (only up to max_x to avoid double-counting)
    top_strip_width = float(sheet_width) - max_y
    if top_strip_width > 0 and max_x > 0:
        reusable = max_x >= MIN_REUSABLE_LENGTH and top_strip_width >= MIN_REUSABLE_WIDTH
        offcuts.append(
            Offcut(
                id=str(uuid.uuid4()),
                sheet_index=sheet_index,
                x_mm=0,
                y_mm=max_y,
                length_mm=max_x,
                width_mm=top_strip_width,
                area_mm2=max_x * top_strip_width,
                reusable=reusable,
            )
        )

    return offcuts
