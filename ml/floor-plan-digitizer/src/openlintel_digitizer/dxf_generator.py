"""
DXF file generation from structured floor plan data.

Uses ``ezdxf`` to produce industry-standard DXF files with proper layer
organisation, line weights, colours, and dimension annotations.

Layer structure:
- ``WALLS`` — Wall centre-lines and hatched wall areas.
- ``WALLS_EXTERIOR`` — Exterior walls (thicker line weight).
- ``DOORS`` — Door openings with swing arcs.
- ``WINDOWS`` — Window openings with glazing lines.
- ``ROOMS`` — Room boundary polygons and labels.
- ``DIMENSIONS`` — Dimension annotations.
- ``FURNITURE`` — Furniture blocks (if provided).
- ``ANNOTATIONS`` — Text labels and notes.

All geometry is in millimetres, matching the ``FloorPlanData`` schema.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path

import ezdxf
from ezdxf import units
from ezdxf.document import Drawing
from ezdxf.layouts import Modelspace

from openlintel_digitizer.schemas import (
    DoorWindow,
    DoorWindowType,
    FloorPlanData,
    RoomPolygon,
    WallSegment,
    WallType,
)

logger = logging.getLogger(__name__)

# Layer definitions: (name, color_index, lineweight in 0.01mm)
LAYER_DEFS = {
    "WALLS": (7, 50),  # White/black, 0.50mm
    "WALLS_EXTERIOR": (7, 70),  # White/black, 0.70mm
    "DOORS": (3, 25),  # Green, 0.25mm
    "WINDOWS": (5, 25),  # Blue, 0.25mm
    "ROOMS": (8, 13),  # Grey, 0.13mm
    "DIMENSIONS": (1, 18),  # Red, 0.18mm
    "ANNOTATIONS": (2, 18),  # Yellow, 0.18mm
    "FURNITURE": (6, 13),  # Magenta, 0.13mm
    "HATCH": (8, -1),  # Grey, default
}


class DXFGenerator:
    """Generates DXF files from ``FloorPlanData``.

    Parameters
    ----------
    dxf_version:
        DXF version string (e.g. ``"R2013"``, ``"R2018"``).
    text_height:
        Default text height in mm for labels.
    dimension_text_height:
        Text height for dimension annotations.
    """

    def __init__(
        self,
        *,
        dxf_version: str = "R2013",
        text_height: float = 150.0,
        dimension_text_height: float = 100.0,
    ) -> None:
        self._dxf_version = dxf_version
        self._text_height = text_height
        self._dim_text_height = dimension_text_height

    def generate(
        self,
        floor_plan: FloorPlanData,
        output_path: str | Path | None = None,
    ) -> Drawing:
        """Generate a DXF drawing from floor plan data.

        Parameters
        ----------
        floor_plan:
            Structured floor plan data.
        output_path:
            If provided, save the DXF file to this path.

        Returns
        -------
        ezdxf.document.Drawing
            The generated DXF document.
        """
        doc = ezdxf.new(self._dxf_version)
        doc.units = units.MM

        # Set up layers
        self._create_layers(doc)

        msp = doc.modelspace()

        # Draw walls
        for wall in floor_plan.walls:
            self._draw_wall(msp, wall)

        # Draw room polygons and labels
        for room in floor_plan.rooms:
            self._draw_room(msp, room)

        # Draw doors and windows
        for opening in floor_plan.openings:
            parent_wall = floor_plan.get_wall(opening.wall_id)
            self._draw_opening(msp, opening, parent_wall)

        # Draw dimension annotations
        for dim in floor_plan.dimensions:
            self._draw_dimension(msp, dim)

        # Save if path provided
        if output_path is not None:
            path = Path(output_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            doc.saveas(str(path))
            logger.info("DXF saved to %s", path)

        logger.info(
            "DXF generated: %d walls, %d rooms, %d openings, %d dimensions",
            len(floor_plan.walls),
            len(floor_plan.rooms),
            len(floor_plan.openings),
            len(floor_plan.dimensions),
        )

        return doc

    @staticmethod
    def _create_layers(doc: Drawing) -> None:
        """Create all standard layers in the DXF document."""
        for name, (color, lineweight) in LAYER_DEFS.items():
            layer_kwargs = {"color": color}
            if lineweight >= 0:
                layer_kwargs["lineweight"] = lineweight
            doc.layers.add(name, **layer_kwargs)

    def _draw_wall(self, msp: Modelspace, wall: WallSegment) -> None:
        """Draw a wall segment as a centre-line with offset parallel lines."""
        layer = "WALLS_EXTERIOR" if wall.wall_type == WallType.EXTERIOR else "WALLS"

        sx, sy = wall.start.x, wall.start.y
        ex, ey = wall.end.x, wall.end.y
        half_t = wall.thickness_mm / 2.0

        # Centre-line (dashed)
        msp.add_line(
            (sx, sy), (ex, ey),
            dxfattribs={"layer": layer, "linetype": "CENTER"},
        )

        # Compute perpendicular offset for wall edges
        dx = ex - sx
        dy = ey - sy
        length = (dx**2 + dy**2) ** 0.5
        if length == 0:
            return

        # Unit perpendicular vector
        nx = -dy / length
        ny = dx / length

        # Wall edge lines (solid)
        msp.add_line(
            (sx + nx * half_t, sy + ny * half_t),
            (ex + nx * half_t, ey + ny * half_t),
            dxfattribs={"layer": layer},
        )
        msp.add_line(
            (sx - nx * half_t, sy - ny * half_t),
            (ex - nx * half_t, ey - ny * half_t),
            dxfattribs={"layer": layer},
        )

        # End caps
        msp.add_line(
            (sx + nx * half_t, sy + ny * half_t),
            (sx - nx * half_t, sy - ny * half_t),
            dxfattribs={"layer": layer},
        )
        msp.add_line(
            (ex + nx * half_t, ey + ny * half_t),
            (ex - nx * half_t, ey - ny * half_t),
            dxfattribs={"layer": layer},
        )

    def _draw_room(self, msp: Modelspace, room: RoomPolygon) -> None:
        """Draw a room boundary polygon and its label."""
        if room.num_vertices < 3:
            return

        # Closed polyline for room boundary
        points = [(v.x, v.y) for v in room.vertices]
        msp.add_lwpolyline(
            points,
            close=True,
            dxfattribs={"layer": "ROOMS"},
        )

        # Room label at centroid
        centroid = room.centroid
        label_text = f"{room.name}\n{room.area_sqm:.1f} sq.m"
        msp.add_mtext(
            label_text,
            dxfattribs={
                "layer": "ANNOTATIONS",
                "char_height": self._text_height,
                "insert": (centroid.x, centroid.y),
            },
        )

    def _draw_opening(
        self,
        msp: Modelspace,
        opening: DoorWindow,
        parent_wall: WallSegment | None,
    ) -> None:
        """Draw a door or window opening.

        Doors include a swing arc; windows include glazing lines.
        """
        if parent_wall is None:
            logger.warning(
                "Opening %s references unknown wall %s — skipping",
                opening.id,
                opening.wall_id,
            )
            return

        # Compute opening position on the wall
        sx, sy = parent_wall.start.x, parent_wall.start.y
        ex, ey = parent_wall.end.x, parent_wall.end.y
        dx = ex - sx
        dy = ey - sy
        wall_length = (dx**2 + dy**2) ** 0.5
        if wall_length == 0:
            return

        # Unit vectors along and perpendicular to wall
        ux, uy = dx / wall_length, dy / wall_length  # Along wall
        nx, ny = -uy, ux  # Perpendicular

        # Position along wall
        pos = opening.position_along_wall_mm
        center_x = sx + ux * pos
        center_y = sy + uy * pos

        half_w = opening.width_mm / 2.0
        half_t = parent_wall.thickness_mm / 2.0

        if opening.is_door:
            layer = "DOORS"
            # Opening gap in wall (two short lines breaking the wall)
            # Draw the opening as a gap: clear the wall lines

            # Door leaf (line showing the door panel)
            leaf_start_x = center_x - ux * half_w
            leaf_start_y = center_y - uy * half_w

            # Swing arc
            swing_radius = opening.width_mm
            start_angle: float
            end_angle: float

            if opening.swing_direction == "left":
                start_angle = 0
                end_angle = 90
            elif opening.swing_direction == "right":
                start_angle = 90
                end_angle = 180
            else:
                start_angle = 0
                end_angle = 90

            # Draw door leaf line
            msp.add_line(
                (leaf_start_x, leaf_start_y),
                (leaf_start_x + nx * swing_radius, leaf_start_y + ny * swing_radius),
                dxfattribs={"layer": layer},
            )

            # Draw swing arc
            wall_angle = math.degrees(math.atan2(dy, dx))
            msp.add_arc(
                center=(leaf_start_x, leaf_start_y),
                radius=swing_radius,
                start_angle=wall_angle,
                end_angle=wall_angle + 90,
                dxfattribs={"layer": layer},
            )

        else:
            layer = "WINDOWS"
            # Window: draw glazing lines (two parallel lines across the wall)
            w_start_x = center_x - ux * half_w
            w_start_y = center_y - uy * half_w
            w_end_x = center_x + ux * half_w
            w_end_y = center_y + uy * half_w

            # Glazing lines offset from centre-line
            glass_offset = half_t * 0.3
            for offset_sign in [-1, 1]:
                off = glass_offset * offset_sign
                msp.add_line(
                    (w_start_x + nx * off, w_start_y + ny * off),
                    (w_end_x + nx * off, w_end_y + ny * off),
                    dxfattribs={"layer": layer},
                )

            # Cross lines at ends (sill lines)
            for pos_sign in [-1, 1]:
                px = center_x + ux * half_w * pos_sign
                py = center_y + uy * half_w * pos_sign
                msp.add_line(
                    (px + nx * glass_offset, py + ny * glass_offset),
                    (px - nx * glass_offset, py - ny * glass_offset),
                    dxfattribs={"layer": layer},
                )

    def _draw_dimension(self, msp: Modelspace, dim: object) -> None:
        """Draw a dimension annotation.

        Uses aligned dimensions for accurate measurement display.
        """
        # dim is a DimensionAnnotation but typed as object to avoid circular import issues
        start = getattr(dim, "start", None)
        end = getattr(dim, "end", None)
        value_mm = getattr(dim, "value_mm", 0)
        offset = getattr(dim, "offset_mm", 300.0)

        if start is None or end is None:
            return

        sx, sy = start.x, start.y
        ex, ey = end.x, end.y

        # Compute offset direction (perpendicular to dimension line)
        dx = ex - sx
        dy = ey - sy
        length = (dx**2 + dy**2) ** 0.5
        if length == 0:
            return

        nx = -dy / length
        ny = dx / length

        # Dimension line position (offset from measured element)
        dim_y_offset = offset

        # Use ezdxf's dimension support
        dim_line = msp.add_aligned_dim(
            p1=(sx, sy),
            p2=(ex, ey),
            distance=dim_y_offset,
            override={"dimtxt": self._dim_text_height},
            dxfattribs={"layer": "DIMENSIONS"},
        )
        dim_line.render()

    def save(self, doc: Drawing, output_path: str | Path) -> str:
        """Save a DXF document to file.

        Parameters
        ----------
        doc:
            The ezdxf Drawing to save.
        output_path:
            Destination file path.

        Returns
        -------
        str
            Absolute path to the saved file.
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        doc.saveas(str(path))
        logger.info("DXF saved to %s", path)
        return str(path.resolve())
