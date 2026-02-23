"""
OpenLintel Room Segmentation — VLM + SAM 2 + Depth Anything V2 pipeline.

Analyses room photographs to produce instance segmentation masks, depth maps,
and structured object inventories.  The pipeline is designed to be called from
services (e.g. the design service) rather than run as a standalone server.

Typical usage::

    from openlintel_segmentation import SegmentationPipeline, SegmentationResult

    pipeline = SegmentationPipeline()
    result: SegmentationResult = await pipeline.run(image_bytes=raw_bytes)
    for obj in result.objects:
        print(obj.label, obj.confidence, obj.bbox)
"""

from openlintel_segmentation.pipeline import SegmentationPipeline
from openlintel_segmentation.schemas import (
    BoundingBox,
    DepthMap,
    DetectedObject,
    SegmentationResult,
)

__all__ = [
    "SegmentationPipeline",
    "SegmentationResult",
    "DepthMap",
    "DetectedObject",
    "BoundingBox",
]
