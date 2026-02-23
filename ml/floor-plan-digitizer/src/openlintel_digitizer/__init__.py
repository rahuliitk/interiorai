"""
OpenLintel Floor Plan Digitizer — raster/DWG to structured CAD conversion.

Converts floor plan images (JPEG, PNG, scanned PDFs) and DWG files into
structured DXF output with proper layers for walls, doors, windows, and
dimensions.

Pipeline options:
1. DWG -> DXF via LibreDWG (direct conversion).
2. Raster image -> VLM extraction -> structured JSON -> DXF generation.

Typical usage::

    from openlintel_digitizer import FloorPlanPipeline, FloorPlanData

    pipeline = FloorPlanPipeline()
    result: FloorPlanData = await pipeline.digitize_image(image_bytes=raw_bytes)
    dxf_path = pipeline.export_dxf(result, output_path="output.dxf")
"""

from openlintel_digitizer.dxf_generator import DXFGenerator
from openlintel_digitizer.pipeline import FloorPlanPipeline
from openlintel_digitizer.schemas import (
    DoorWindow,
    FloorPlanData,
    RoomPolygon,
    WallSegment,
)

__all__ = [
    "FloorPlanPipeline",
    "DXFGenerator",
    "FloorPlanData",
    "RoomPolygon",
    "DoorWindow",
    "WallSegment",
]
