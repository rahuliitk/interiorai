"""
SAM 2 (Segment Anything Model 2) wrapper for instance segmentation.

Given bounding-box prompts from the VLM detector, SAM 2 produces high-quality
pixel-level masks for each detected object.  This wrapper handles model
loading, GPU/CPU device management, and batch inference.

SAM 2 reference: https://github.com/facebookresearch/segment-anything-2
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image

from openlintel_segmentation.schemas import BoundingBox, DetectedObject, mask_to_rle

logger = logging.getLogger(__name__)

# Model checkpoint sizes (ViT backbone variants)
SAM2_CHECKPOINTS = {
    "tiny": "sam2_hiera_tiny.pt",
    "small": "sam2_hiera_small.pt",
    "base_plus": "sam2_hiera_base_plus.pt",
    "large": "sam2_hiera_large.pt",
}

DEFAULT_VARIANT = "base_plus"


class SAM2Wrapper:
    """Wrapper around SAM 2 for prompted instance segmentation.

    The model is lazily loaded on first use and cached for subsequent calls.

    Parameters
    ----------
    model_variant:
        SAM 2 backbone size: ``"tiny"``, ``"small"``, ``"base_plus"``, ``"large"``.
    checkpoint_dir:
        Directory containing SAM 2 checkpoint files.
    device:
        PyTorch device string.  ``"auto"`` selects CUDA if available.
    """

    def __init__(
        self,
        model_variant: str = DEFAULT_VARIANT,
        checkpoint_dir: str | Path = "./checkpoints/sam2",
        device: str = "auto",
    ) -> None:
        self._variant = model_variant
        self._checkpoint_dir = Path(checkpoint_dir)
        self._device = self._resolve_device(device)
        self._model: Any | None = None
        self._predictor: Any | None = None

    @staticmethod
    def _resolve_device(device: str) -> torch.device:
        """Resolve ``"auto"`` to the best available device."""
        if device == "auto":
            if torch.cuda.is_available():
                return torch.device("cuda")
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return torch.device("mps")
            return torch.device("cpu")
        return torch.device(device)

    def _load_model(self) -> None:
        """Lazily load the SAM 2 model and create a predictor."""
        if self._model is not None:
            return

        try:
            from sam2.build_sam import build_sam2
            from sam2.sam2_image_predictor import SAM2ImagePredictor

            checkpoint_name = SAM2_CHECKPOINTS.get(self._variant)
            if checkpoint_name is None:
                available = ", ".join(SAM2_CHECKPOINTS)
                raise ValueError(
                    f"Unknown SAM 2 variant '{self._variant}'. Available: {available}"
                )

            checkpoint_path = self._checkpoint_dir / checkpoint_name
            config_name = f"sam2_hiera_{self._variant[0]}.yaml"  # Simplified config naming

            logger.info(
                "Loading SAM 2 model: variant=%s, device=%s, checkpoint=%s",
                self._variant,
                self._device,
                checkpoint_path,
            )

            self._model = build_sam2(
                config_file=config_name,
                ckpt_path=str(checkpoint_path),
                device=str(self._device),
            )
            self._predictor = SAM2ImagePredictor(self._model)

            logger.info("SAM 2 model loaded successfully")

        except ImportError:
            logger.warning(
                "SAM 2 not installed. Install with: "
                "pip install git+https://github.com/facebookresearch/segment-anything-2.git"
            )
            raise

    def segment_objects(
        self,
        image: Image.Image | np.ndarray,
        objects: list[DetectedObject],
        *,
        multimask_output: bool = False,
    ) -> list[DetectedObject]:
        """Generate pixel-level masks for detected objects using bbox prompts.

        Parameters
        ----------
        image:
            Input image as PIL Image or numpy array (H, W, 3) in RGB.
        objects:
            List of detected objects with bounding boxes from the VLM detector.
        multimask_output:
            If ``True``, SAM 2 returns multiple mask candidates per prompt.
            We select the highest-quality one.

        Returns
        -------
        list[DetectedObject]
            The same objects with ``mask_rle`` populated.
        """
        self._load_model()
        assert self._predictor is not None

        # Convert PIL to numpy if needed
        if isinstance(image, Image.Image):
            image_np = np.array(image.convert("RGB"))
        else:
            image_np = image

        # Set the image for the predictor
        self._predictor.set_image(image_np)

        updated_objects: list[DetectedObject] = []

        for obj in objects:
            bbox = obj.bbox
            input_box = np.array([
                [bbox.x_min, bbox.y_min, bbox.x_max, bbox.y_max]
            ])

            try:
                masks, scores, _ = self._predictor.predict(
                    box=input_box,
                    multimask_output=multimask_output,
                )

                # Select the best mask (highest score)
                if multimask_output and len(scores) > 1:
                    best_idx = int(np.argmax(scores))
                    mask = masks[best_idx]
                else:
                    mask = masks[0]

                # Encode mask as RLE
                rle = mask_to_rle(mask.astype(np.uint8))

                updated_obj = obj.model_copy(update={"mask_rle": rle})
                updated_objects.append(updated_obj)

            except Exception as exc:
                logger.warning(
                    "SAM 2 segmentation failed for object %d (%s): %s",
                    obj.id,
                    obj.label,
                    exc,
                )
                # Keep the object without a mask
                updated_objects.append(obj)

        logger.info(
            "SAM 2 segmented %d/%d objects successfully",
            sum(1 for o in updated_objects if o.mask_rle is not None),
            len(objects),
        )

        return updated_objects

    def segment_with_points(
        self,
        image: Image.Image | np.ndarray,
        point_coords: np.ndarray,
        point_labels: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Segment using point prompts instead of bounding boxes.

        Parameters
        ----------
        image:
            Input image.
        point_coords:
            Array of shape ``(N, 2)`` with ``(x, y)`` coordinates.
        point_labels:
            Array of shape ``(N,)`` with ``1`` for foreground, ``0`` for
            background.

        Returns
        -------
        tuple[np.ndarray, np.ndarray]
            ``(masks, scores)`` — masks shape ``(K, H, W)``, scores shape ``(K,)``.
        """
        self._load_model()
        assert self._predictor is not None

        if isinstance(image, Image.Image):
            image_np = np.array(image.convert("RGB"))
        else:
            image_np = image

        self._predictor.set_image(image_np)

        masks, scores, _ = self._predictor.predict(
            point_coords=point_coords,
            point_labels=point_labels,
            multimask_output=True,
        )

        return masks, scores

    @property
    def device(self) -> torch.device:
        """The device the model is loaded on."""
        return self._device

    @property
    def is_loaded(self) -> bool:
        """Whether the model has been loaded."""
        return self._model is not None
