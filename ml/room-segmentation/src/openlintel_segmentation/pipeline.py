"""
Main segmentation pipeline: VLM detection -> SAM 2 masks -> Depth map.

Orchestrates the three sub-components into a single ``run()`` call that
accepts an image and returns a comprehensive ``SegmentationResult``.

The pipeline is designed to degrade gracefully:
- If SAM 2 is not installed, objects are returned without masks.
- If Depth Anything V2 is not installed, depth data is omitted.
- The VLM detector is always required.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from openlintel_segmentation.schemas import (
    DepthMap,
    DetectedObject,
    SegmentationResult,
)
from openlintel_segmentation.vlm_detector import VLMDetector

logger = logging.getLogger(__name__)


class SegmentationPipeline:
    """End-to-end room segmentation pipeline.

    Combines VLM-based detection, SAM 2 instance segmentation, and
    Depth Anything V2 monocular depth estimation into a single workflow.

    Parameters
    ----------
    vlm_model:
        LiteLLM model identifier for the VLM detector.
    vlm_api_key:
        API key for the VLM provider.
    sam2_variant:
        SAM 2 backbone size (``"tiny"`` / ``"small"`` / ``"base_plus"`` / ``"large"``).
    sam2_checkpoint_dir:
        Path to SAM 2 model checkpoints.
    depth_variant:
        Depth Anything V2 backbone size (``"small"`` / ``"base"`` / ``"large"`` / ``"giant"``).
    depth_checkpoint_dir:
        Path to Depth Anything V2 model checkpoints.
    device:
        PyTorch device (``"auto"`` / ``"cuda"`` / ``"cpu"`` / ``"mps"``).
    confidence_threshold:
        Minimum VLM detection confidence to keep an object.
    enable_sam2:
        Whether to run SAM 2 segmentation.  Set ``False`` to skip.
    enable_depth:
        Whether to run depth estimation.  Set ``False`` to skip.
    """

    def __init__(
        self,
        *,
        vlm_model: str = "openai/gpt-4o",
        vlm_api_key: str | None = None,
        sam2_variant: str = "base_plus",
        sam2_checkpoint_dir: str = "./checkpoints/sam2",
        depth_variant: str = "base",
        depth_checkpoint_dir: str = "./checkpoints/depth_anything_v2",
        device: str = "auto",
        confidence_threshold: float = 0.3,
        enable_sam2: bool = True,
        enable_depth: bool = True,
    ) -> None:
        self._vlm_detector = VLMDetector(
            model=vlm_model,
            api_key=vlm_api_key,
            confidence_threshold=confidence_threshold,
        )

        self._sam2_wrapper: Any | None = None
        self._depth_wrapper: Any | None = None

        self._enable_sam2 = enable_sam2
        self._enable_depth = enable_depth

        self._sam2_variant = sam2_variant
        self._sam2_checkpoint_dir = sam2_checkpoint_dir
        self._depth_variant = depth_variant
        self._depth_checkpoint_dir = depth_checkpoint_dir
        self._device = device

    def _get_sam2(self) -> Any:
        """Lazily load the SAM 2 wrapper."""
        if self._sam2_wrapper is None:
            from openlintel_segmentation.sam2_wrapper import SAM2Wrapper

            self._sam2_wrapper = SAM2Wrapper(
                model_variant=self._sam2_variant,
                checkpoint_dir=self._sam2_checkpoint_dir,
                device=self._device,
            )
        return self._sam2_wrapper

    def _get_depth(self) -> Any:
        """Lazily load the Depth Anything V2 wrapper."""
        if self._depth_wrapper is None:
            from openlintel_segmentation.depth_wrapper import DepthAnythingWrapper

            self._depth_wrapper = DepthAnythingWrapper(
                model_variant=self._depth_variant,
                checkpoint_dir=self._depth_checkpoint_dir,
                device=self._device,
            )
        return self._depth_wrapper

    async def run(
        self,
        *,
        image: Image.Image | None = None,
        image_bytes: bytes | None = None,
        image_path: str | Path | None = None,
        depth_output_path: str | Path | None = None,
    ) -> SegmentationResult:
        """Run the full segmentation pipeline on a room image.

        Provide exactly one of ``image``, ``image_bytes``, or ``image_path``.

        Parameters
        ----------
        image:
            PIL Image.
        image_bytes:
            Raw image bytes.
        image_path:
            Path to an image file.
        depth_output_path:
            If provided, save the depth map ``.npy`` file here.

        Returns
        -------
        SegmentationResult
            Complete segmentation result with objects, masks, and depth.
        """
        # Resolve image input
        pil_image = self._resolve_image(image, image_bytes, image_path)
        width, height = pil_image.size

        logger.info("Segmentation pipeline started: image=%dx%d", width, height)

        # Step 1: VLM detection
        logger.info("Step 1/3: VLM object detection")
        objects = await self._vlm_detector.detect(pil_image)
        logger.info("Detected %d objects", len(objects))

        # Step 2: SAM 2 segmentation (optional)
        if self._enable_sam2 and len(objects) > 0:
            logger.info("Step 2/3: SAM 2 instance segmentation")
            try:
                sam2 = self._get_sam2()
                objects = sam2.segment_objects(pil_image, objects)
                masked_count = sum(1 for o in objects if o.mask_rle is not None)
                logger.info("SAM 2 produced masks for %d/%d objects", masked_count, len(objects))
            except ImportError:
                logger.warning("SAM 2 not available — skipping mask generation")
            except Exception as exc:
                logger.error("SAM 2 failed: %s — continuing without masks", exc)
        else:
            logger.info("Step 2/3: SAM 2 skipped (disabled or no objects)")

        # Step 3: Depth estimation (optional)
        depth_map_meta: DepthMap | None = None
        if self._enable_depth:
            logger.info("Step 3/3: Depth Anything V2 depth estimation")
            try:
                depth = self._get_depth()
                depth_array, depth_map_meta = depth.estimate_depth(pil_image)

                # Enrich objects with depth statistics
                objects = depth.compute_object_depths(depth_array, objects)

                # Save depth map if path provided
                if depth_output_path is not None:
                    saved_path = depth.save_depth_map(depth_array, depth_output_path)
                    depth_map_meta = depth_map_meta.model_copy(
                        update={"storage_path": saved_path}
                    )

            except ImportError:
                logger.warning("Depth Anything V2 not available — skipping depth estimation")
            except Exception as exc:
                logger.error("Depth estimation failed: %s — continuing without depth", exc)
        else:
            logger.info("Step 3/3: Depth estimation skipped (disabled)")

        # Extract room-level metadata from VLM detections
        detected_room_type = self._infer_room_type(objects)

        result = SegmentationResult(
            image_width=width,
            image_height=height,
            objects=objects,
            depth_map=depth_map_meta,
            detected_room_type=detected_room_type,
        )

        logger.info(
            "Segmentation pipeline complete: %d objects, depth=%s, room_type=%s",
            result.object_count,
            "yes" if depth_map_meta else "no",
            detected_room_type,
        )

        return result

    @staticmethod
    def _resolve_image(
        image: Image.Image | None,
        image_bytes: bytes | None,
        image_path: str | Path | None,
    ) -> Image.Image:
        """Resolve one of the three image input formats to a PIL Image."""
        if image is not None:
            return image.convert("RGB")
        if image_bytes is not None:
            return Image.open(io.BytesIO(image_bytes)).convert("RGB")
        if image_path is not None:
            return Image.open(image_path).convert("RGB")
        raise ValueError("Provide one of: image, image_bytes, or image_path")

    @staticmethod
    def _infer_room_type(objects: list[DetectedObject]) -> str | None:
        """Heuristic room-type inference from detected objects.

        Uses presence of characteristic fixtures/appliances to guess
        the room type when it is not explicitly provided.
        """
        labels_lower = {obj.label.lower() for obj in objects}
        all_text = " ".join(labels_lower)

        # Check for bathroom indicators
        bathroom_keywords = {"toilet", "bathtub", "shower", "bath", "bidet"}
        if bathroom_keywords & labels_lower or any(kw in all_text for kw in bathroom_keywords):
            return "bathroom"

        # Check for kitchen indicators
        kitchen_keywords = {"oven", "stove", "refrigerator", "fridge", "dishwasher", "kitchen"}
        if kitchen_keywords & labels_lower or any(kw in all_text for kw in kitchen_keywords):
            return "kitchen"

        # Check for bedroom indicators
        bedroom_keywords = {"bed", "nightstand", "wardrobe", "dresser", "headboard"}
        if bedroom_keywords & labels_lower or any(kw in all_text for kw in bedroom_keywords):
            return "bedroom"

        # Check for dining indicators
        dining_keywords = {"dining table", "dining chair"}
        if any(kw in all_text for kw in dining_keywords):
            return "dining"

        # Check for study indicators
        study_keywords = {"desk", "bookshelf", "monitor", "computer"}
        if any(kw in all_text for kw in study_keywords):
            return "study"

        # Default to living room if furniture is present
        if any(obj.label.lower() in {"sofa", "couch", "coffee table"} for obj in objects):
            return "living_room"

        return None
