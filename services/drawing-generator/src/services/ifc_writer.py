"""
IFC (Industry Foundation Classes) writer using ifcopenshell.

Creates IFC4-compliant BIM files from the same ``drawing_data`` dict used by
``dxf_writer.py``.  Maps walls, doors, windows, and furniture to their IFC
equivalents: IfcWall, IfcDoor, IfcWindow, and IfcFurnishingElement.
"""

from __future__ import annotations

import io
import uuid
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


def _guid() -> str:
    """Return a 22-char IFC GlobalId from a random UUID."""
    try:
        import ifcopenshell.guid as ifc_guid

        return ifc_guid.new()
    except Exception:
        # Fallback: base64-encoded UUID truncated to 22 chars
        import base64

        raw = uuid.uuid4().bytes
        return base64.urlsafe_b64encode(raw).decode("ascii")[:22]


def create_ifc_drawing(
    drawing_data: dict[str, Any],
    drawing_type: str = "floor_plan",
    schema: str = "IFC4",
) -> bytes:
    """Create an IFC file from structured drawing data.

    Parameters
    ----------
    drawing_data:
        The structured drawing data from the DrawingAgent (same format as
        ``dxf_writer.create_dxf_drawing``).
    drawing_type:
        The drawing type label (for metadata only).
    schema:
        IFC schema version.

    Returns
    -------
    bytes
        The serialised IFC file content.
    """
    try:
        import ifcopenshell
    except ImportError:
        logger.warning("ifcopenshell_not_installed", hint="pip install ifcopenshell")
        raise ImportError(
            "ifcopenshell is required for IFC export. "
            "Install it with: pip install 'ifcopenshell>=0.7'"
        )

    ifc = ifcopenshell.file(schema=schema)

    # ── Contexts & Units ─────────────────────────────────────
    # Create geometric representation context
    origin = ifc.createIfcCartesianPoint((0.0, 0.0, 0.0))
    z_axis = ifc.createIfcDirection((0.0, 0.0, 1.0))
    x_axis = ifc.createIfcDirection((1.0, 0.0, 0.0))
    world_coordinate = ifc.createIfcAxis2Placement3D(origin, z_axis, x_axis)
    context = ifc.createIfcGeometricRepresentationContext(
        "Model", "Model", 3, 1.0e-05, world_coordinate
    )
    body_context = ifc.createIfcGeometricRepresentationSubContext(
        "Body", "Model", None, None, None, None, context, None, "MODEL_VIEW", None
    )

    # Units — millimetres
    mm_unit = ifc.createIfcSIUnit(None, "LENGTHUNIT", "MILLI", "METRE")
    sqm_unit = ifc.createIfcSIUnit(None, "AREAUNIT", None, "SQUARE_METRE")
    cbm_unit = ifc.createIfcSIUnit(None, "VOLUMEUNIT", None, "CUBIC_METRE")
    radian_unit = ifc.createIfcSIUnit(None, "PLANEANGLEUNIT", None, "RADIAN")
    unit_assignment = ifc.createIfcUnitAssignment([mm_unit, sqm_unit, cbm_unit, radian_unit])

    # ── Project / Site / Building / Storey ────────────────────
    owner_history = ifc.createIfcOwnerHistory(
        ifc.createIfcPersonAndOrganization(
            ifc.createIfcPerson(None, "OpenLintel", None, None, None, None, None, None),
            ifc.createIfcOrganization(None, "OpenLintel", None, None, None),
            None,
        ),
        ifc.createIfcApplication(
            ifc.createIfcOrganization(None, "OpenLintel", None, None, None),
            "0.1.0",
            "OpenLintel Drawing Generator",
            "OpenLintel",
        ),
        None,
        "READWRITE",
        None,
        None,
        None,
        0,
    )

    project = ifc.createIfcProject(
        _guid(), owner_history, "OpenLintel Project", None, None, None, None,
        [context], unit_assignment,
    )

    site_placement = ifc.createIfcLocalPlacement(None, world_coordinate)
    site = ifc.createIfcSite(
        _guid(), owner_history, "Default Site", None, None,
        site_placement, None, None, "ELEMENT", None, None, None, None, None,
    )
    ifc.createIfcRelAggregates(_guid(), owner_history, None, None, project, [site])

    building_placement = ifc.createIfcLocalPlacement(site_placement, world_coordinate)
    building = ifc.createIfcBuilding(
        _guid(), owner_history, "Default Building", None, None,
        building_placement, None, None, "ELEMENT", None, None, None,
    )
    ifc.createIfcRelAggregates(_guid(), owner_history, None, None, site, [building])

    storey_placement = ifc.createIfcLocalPlacement(building_placement, world_coordinate)
    storey = ifc.createIfcBuildingStorey(
        _guid(), owner_history, "Ground Floor", None, None,
        storey_placement, None, None, "ELEMENT", 0.0,
    )
    ifc.createIfcRelAggregates(_guid(), owner_history, None, None, building, [storey])

    # ── Helpers ───────────────────────────────────────────────
    room_dims = drawing_data.get("room_dimensions", {})
    length_mm = float(room_dims.get("length_mm", 4000))
    width_mm = float(room_dims.get("width_mm", 3000))
    height_mm = float(room_dims.get("height_mm", 2700))

    def _make_extrusion(
        x: float, y: float, dx: float, dy: float, dz: float,
    ) -> Any:
        """Create an extruded-area solid from a rectangle."""
        pts = [
            ifc.createIfcCartesianPoint((0.0, 0.0)),
            ifc.createIfcCartesianPoint((dx, 0.0)),
            ifc.createIfcCartesianPoint((dx, dy)),
            ifc.createIfcCartesianPoint((0.0, dy)),
        ]
        polyline = ifc.createIfcPolyline(pts + [pts[0]])
        profile = ifc.createIfcArbitraryClosedProfileDef("AREA", None, polyline)
        direction = ifc.createIfcDirection((0.0, 0.0, 1.0))
        solid = ifc.createIfcExtrudedAreaSolid(profile, None, direction, dz)

        local_origin = ifc.createIfcCartesianPoint((x, y, 0.0))
        local_placement_3d = ifc.createIfcAxis2Placement3D(local_origin, None, None)
        placement = ifc.createIfcLocalPlacement(storey_placement, local_placement_3d)

        shape_repr = ifc.createIfcShapeRepresentation(
            body_context, "Body", "SweptSolid", [solid]
        )
        product_repr = ifc.createIfcProductDefinitionShape(None, None, [shape_repr])
        return placement, product_repr

    products: list[Any] = []

    # ── Walls ─────────────────────────────────────────────────
    entities = drawing_data.get("entities", {})
    walls = entities.get("walls", [])
    wall_thickness = 150.0  # default

    if walls:
        for wall in walls:
            sx = float(wall.get("start_x", 0))
            sy = float(wall.get("start_y", 0))
            ex = float(wall.get("end_x", sx))
            ey = float(wall.get("end_y", sy))
            thickness = float(wall.get("thickness", wall_thickness))
            h = float(wall.get("height", height_mm))

            dx = abs(ex - sx) or thickness
            dy = abs(ey - sy) or thickness
            ox = min(sx, ex)
            oy = min(sy, ey)

            placement, product_repr = _make_extrusion(ox, oy, dx, dy, h)
            ifc_wall = ifc.createIfcWall(
                _guid(), owner_history,
                wall.get("label", "Wall"), None, None,
                placement, product_repr, None, "STANDARD",
            )
            products.append(ifc_wall)
    else:
        # Generate default room boundary walls
        for label, ox, oy, dx, dy in [
            ("North Wall", 0, width_mm - wall_thickness, length_mm, wall_thickness),
            ("South Wall", 0, 0, length_mm, wall_thickness),
            ("West Wall", 0, 0, wall_thickness, width_mm),
            ("East Wall", length_mm - wall_thickness, 0, wall_thickness, width_mm),
        ]:
            placement, product_repr = _make_extrusion(ox, oy, dx, dy, height_mm)
            ifc_wall = ifc.createIfcWall(
                _guid(), owner_history, label, None, None,
                placement, product_repr, None, "STANDARD",
            )
            products.append(ifc_wall)

    # ── Doors ─────────────────────────────────────────────────
    for door in entities.get("doors", []):
        dw = float(door.get("width", 900))
        dh = float(door.get("height", 2100))
        dx = float(door.get("x", 0))
        dy = float(door.get("y", 0))
        depth = float(door.get("depth", wall_thickness))

        placement, product_repr = _make_extrusion(dx, dy, dw, depth, dh)
        ifc_door = ifc.createIfcDoor(
            _guid(), owner_history,
            door.get("label", "Door"), None, None,
            placement, product_repr, None, dh, dw,
        )
        products.append(ifc_door)

    # ── Windows ───────────────────────────────────────────────
    for win in entities.get("windows", []):
        ww = float(win.get("width", 1200))
        wh = float(win.get("height", 1200))
        wx = float(win.get("x", 0))
        wy = float(win.get("y", 0))
        sill_height = float(win.get("sill_height", 900))
        depth = float(win.get("depth", wall_thickness))

        local_origin = ifc.createIfcCartesianPoint((wx, wy, sill_height))
        local_placement_3d = ifc.createIfcAxis2Placement3D(local_origin, None, None)
        placement = ifc.createIfcLocalPlacement(storey_placement, local_placement_3d)

        pts = [
            ifc.createIfcCartesianPoint((0.0, 0.0)),
            ifc.createIfcCartesianPoint((ww, 0.0)),
            ifc.createIfcCartesianPoint((ww, depth)),
            ifc.createIfcCartesianPoint((0.0, depth)),
        ]
        polyline = ifc.createIfcPolyline(pts + [pts[0]])
        profile = ifc.createIfcArbitraryClosedProfileDef("AREA", None, polyline)
        direction = ifc.createIfcDirection((0.0, 0.0, 1.0))
        solid = ifc.createIfcExtrudedAreaSolid(profile, None, direction, wh)
        shape_repr = ifc.createIfcShapeRepresentation(
            body_context, "Body", "SweptSolid", [solid]
        )
        product_repr = ifc.createIfcProductDefinitionShape(None, None, [shape_repr])

        ifc_win = ifc.createIfcWindow(
            _guid(), owner_history,
            win.get("label", "Window"), None, None,
            placement, product_repr, None, wh, ww,
        )
        products.append(ifc_win)

    # ── Furniture ─────────────────────────────────────────────
    for furn in entities.get("furniture", []):
        fw = float(furn.get("width", 600))
        fd = float(furn.get("depth", 600))
        fh = float(furn.get("height", 750))
        fx = float(furn.get("x", 0))
        fy = float(furn.get("y", 0))

        placement, product_repr = _make_extrusion(fx, fy, fw, fd, fh)
        ifc_furn = ifc.createIfcFurnishingElement(
            _guid(), owner_history,
            furn.get("label", furn.get("type", "Furniture")), None, None,
            placement, product_repr, None,
        )
        products.append(ifc_furn)

    # ── Contain products in storey ────────────────────────────
    if products:
        ifc.createIfcRelContainedInSpatialStructure(
            _guid(), owner_history, None, None, products, storey,
        )

    # ── Serialise ─────────────────────────────────────────────
    buf = io.BytesIO()
    ifc.write(buf)
    result = buf.getvalue()
    logger.info(
        "ifc_created",
        drawing_type=drawing_type,
        schema=schema,
        elements=len(products),
        size_bytes=len(result),
    )
    return result
