"""
Offcut tracking service.

Manages reusable offcuts produced during panel nesting.  Provides
matching logic to find existing offcuts that can fulfil new panel
requirements, reducing material waste across projects.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import structlog
from pydantic import BaseModel, Field

from src.models.nesting import Offcut
from src.models.panels import CutListPanel

logger = structlog.get_logger(__name__)

# Minimum dimensions for an offcut to be considered reusable
MIN_REUSABLE_LENGTH_MM = 200.0
MIN_REUSABLE_WIDTH_MM = 200.0

# Tolerance for matching offcuts to panels (mm)
MATCH_TOLERANCE_MM = 5.0


class StoredOffcut(BaseModel):
    """An offcut stored in the inventory for potential reuse."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_cutlist_id: str
    source_sheet_index: int
    material: str
    thickness_mm: float
    length_mm: float
    width_mm: float
    area_mm2: float
    stored_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    used: bool = False
    used_for_panel_id: str | None = None
    location_label: str | None = Field(
        default=None,
        description="Physical storage location label (e.g. 'Rack A, Slot 3')",
    )


class OffcutMatch(BaseModel):
    """A match between a stored offcut and a required panel."""

    offcut_id: str
    panel_id: str
    panel_name: str
    offcut_length_mm: float
    offcut_width_mm: float
    panel_length_mm: float
    panel_width_mm: float
    remaining_area_mm2: float
    fit_quality: str = Field(description="'exact', 'good', or 'marginal'")


class OffcutInventory:
    """In-memory offcut inventory for tracking reusable material.

    In production this would be backed by a database table.  The in-memory
    implementation supports the same API for local development and testing.
    """

    def __init__(self) -> None:
        self._offcuts: dict[str, StoredOffcut] = {}

    def add_offcuts_from_nesting(
        self,
        offcuts: list[Offcut],
        cutlist_id: str,
        material: str,
        thickness_mm: float,
    ) -> list[StoredOffcut]:
        """Register reusable offcuts from a nesting operation.

        Parameters
        ----------
        offcuts:
            Offcuts produced by the nesting algorithm.
        cutlist_id:
            The cut list that generated these offcuts.
        material:
            Panel material of the sheet.
        thickness_mm:
            Sheet thickness.

        Returns
        -------
        list[StoredOffcut]
            The offcuts that were stored (only reusable ones).
        """
        stored: list[StoredOffcut] = []
        for offcut in offcuts:
            if not offcut.reusable:
                continue
            if offcut.length_mm < MIN_REUSABLE_LENGTH_MM:
                continue
            if offcut.width_mm < MIN_REUSABLE_WIDTH_MM:
                continue

            stored_offcut = StoredOffcut(
                source_cutlist_id=cutlist_id,
                source_sheet_index=offcut.sheet_index,
                material=material,
                thickness_mm=thickness_mm,
                length_mm=offcut.length_mm,
                width_mm=offcut.width_mm,
                area_mm2=offcut.area_mm2,
            )
            self._offcuts[stored_offcut.id] = stored_offcut
            stored.append(stored_offcut)

        logger.info(
            "offcuts_stored",
            cutlist_id=cutlist_id,
            total_offcuts=len(offcuts),
            reusable_stored=len(stored),
        )
        return stored

    def find_matches(
        self,
        panel: CutListPanel,
        tolerance_mm: float = MATCH_TOLERANCE_MM,
    ) -> list[OffcutMatch]:
        """Find stored offcuts that can accommodate a panel.

        Checks both orientations (normal and rotated 90 degrees) and
        filters by material and thickness match.

        Parameters
        ----------
        panel:
            The panel to find matching offcuts for.
        tolerance_mm:
            How much larger the offcut must be than the panel (mm).

        Returns
        -------
        list[OffcutMatch]
            Matching offcuts sorted by remaining area (best fit first).
        """
        matches: list[OffcutMatch] = []

        for offcut in self._offcuts.values():
            if offcut.used:
                continue
            if offcut.material != panel.material.value:
                continue
            if abs(offcut.thickness_mm - panel.thickness_mm) > 0.5:
                continue

            # Check normal orientation
            fits_normal = (
                offcut.length_mm >= panel.length_mm + tolerance_mm
                and offcut.width_mm >= panel.width_mm + tolerance_mm
            )
            # Check rotated orientation (only for grain_direction='none')
            fits_rotated = (
                panel.grain_direction == "none"
                and offcut.length_mm >= panel.width_mm + tolerance_mm
                and offcut.width_mm >= panel.length_mm + tolerance_mm
            )

            if fits_normal or fits_rotated:
                remaining = offcut.area_mm2 - panel.area_mm2
                excess_ratio = remaining / offcut.area_mm2 if offcut.area_mm2 > 0 else 1.0

                if excess_ratio < 0.1:
                    quality = "exact"
                elif excess_ratio < 0.4:
                    quality = "good"
                else:
                    quality = "marginal"

                matches.append(
                    OffcutMatch(
                        offcut_id=offcut.id,
                        panel_id=panel.id,
                        panel_name=panel.part_name,
                        offcut_length_mm=offcut.length_mm,
                        offcut_width_mm=offcut.width_mm,
                        panel_length_mm=panel.length_mm,
                        panel_width_mm=panel.width_mm,
                        remaining_area_mm2=remaining,
                        fit_quality=quality,
                    )
                )

        # Sort by remaining area (smallest waste first)
        matches.sort(key=lambda m: m.remaining_area_mm2)
        return matches

    def mark_used(self, offcut_id: str, panel_id: str) -> StoredOffcut | None:
        """Mark an offcut as used for a specific panel.

        Parameters
        ----------
        offcut_id:
            The offcut to mark.
        panel_id:
            The panel it was used for.

        Returns
        -------
        StoredOffcut | None
            The updated offcut, or None if not found.
        """
        offcut = self._offcuts.get(offcut_id)
        if offcut is None:
            return None
        offcut.used = True
        offcut.used_for_panel_id = panel_id
        return offcut

    def get_available(self, material: str | None = None) -> list[StoredOffcut]:
        """List all available (unused) offcuts, optionally filtered by material.

        Parameters
        ----------
        material:
            Optional material filter.

        Returns
        -------
        list[StoredOffcut]
            Available offcuts sorted by area (largest first).
        """
        available = [o for o in self._offcuts.values() if not o.used]
        if material:
            available = [o for o in available if o.material == material]
        available.sort(key=lambda o: o.area_mm2, reverse=True)
        return available

    def get_all(self) -> list[StoredOffcut]:
        """Return all tracked offcuts."""
        return list(self._offcuts.values())


# Module-level singleton for use across the service
offcut_inventory = OffcutInventory()
