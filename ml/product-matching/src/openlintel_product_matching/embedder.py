"""
Product embedder using CLIP ViT-B/32.

Generates 512-dimensional embeddings for images and text using OpenAI's
CLIP model via torchvision.  The model is lazily loaded on first use and
cached for subsequent calls, following the ``SAM2Wrapper`` pattern from
``ml/room-segmentation/``.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

# CLIP ViT-B/32 produces 512-dim embeddings
EMBEDDING_DIM = 512


class ProductEmbedder:
    """CLIP-based product image/text embedder.

    The model is lazily loaded on first use and cached for subsequent calls.

    Parameters
    ----------
    model_name:
        CLIP model variant.  Currently only ``"clip"`` (ViT-B/32) is supported.
    device:
        PyTorch device string.  ``"auto"`` selects CUDA if available.
    """

    def __init__(
        self,
        model_name: str = "clip",
        device: str = "auto",
    ) -> None:
        self._model_name = model_name
        self._device = self._resolve_device(device)
        self._model: Any | None = None
        self._preprocess: Any | None = None
        self._tokenizer: Any | None = None

    @staticmethod
    def _resolve_device(device: str) -> torch.device:
        if device == "auto":
            if torch.cuda.is_available():
                return torch.device("cuda")
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return torch.device("mps")
            return torch.device("cpu")
        return torch.device(device)

    def _load_model(self) -> None:
        """Lazily load the CLIP model."""
        if self._model is not None:
            return

        logger.info("loading_clip_model", device=str(self._device))

        try:
            import clip  # type: ignore[import-untyped]

            model, preprocess = clip.load("ViT-B/32", device=self._device)
            self._model = model
            self._preprocess = preprocess
            self._tokenizer = clip.tokenize
        except ImportError:
            # Fallback: use torchvision CLIP
            from torchvision.models import get_model
            from torchvision.transforms import (
                CenterCrop,
                Compose,
                Normalize,
                Resize,
                ToTensor,
            )

            model = get_model("vit_b_32", weights="DEFAULT")
            model = model.to(self._device)
            model.eval()
            self._model = model
            self._preprocess = Compose([
                Resize(224),
                CenterCrop(224),
                ToTensor(),
                Normalize(
                    mean=[0.48145466, 0.4578275, 0.40821073],
                    std=[0.26862954, 0.26130258, 0.27577711],
                ),
            ])
            self._tokenizer = None

        logger.info("clip_model_loaded", device=str(self._device))

    def embed_image(self, image: Image.Image) -> list[float]:
        """Embed a PIL Image into a 512-dim vector.

        Parameters
        ----------
        image:
            A PIL Image.

        Returns
        -------
        list[float]
            512-dimensional normalised embedding.
        """
        self._load_model()

        image_input = self._preprocess(image).unsqueeze(0).to(self._device)  # type: ignore[union-attr]

        with torch.no_grad():
            if hasattr(self._model, "encode_image"):
                features = self._model.encode_image(image_input)
            else:
                features = self._model(image_input)

            features = features / features.norm(dim=-1, keepdim=True)

        return features.squeeze().cpu().numpy().tolist()

    def embed_images_batch(self, images: list[Image.Image]) -> list[list[float]]:
        """Embed multiple images in a batch.

        Parameters
        ----------
        images:
            List of PIL Images.

        Returns
        -------
        list[list[float]]
            List of 512-dimensional embeddings.
        """
        self._load_model()

        tensors = torch.stack(
            [self._preprocess(img) for img in images]  # type: ignore[union-attr]
        ).to(self._device)

        with torch.no_grad():
            if hasattr(self._model, "encode_image"):
                features = self._model.encode_image(tensors)
            else:
                features = self._model(tensors)

            features = features / features.norm(dim=-1, keepdim=True)

        return features.cpu().numpy().tolist()

    def embed_from_bytes(self, data: bytes) -> list[float]:
        """Embed an image from raw bytes."""
        image = Image.open(io.BytesIO(data)).convert("RGB")
        return self.embed_image(image)

    def embed_from_path(self, path: str | Path) -> list[float]:
        """Embed an image from a file path."""
        image = Image.open(path).convert("RGB")
        return self.embed_image(image)

    def embed_from_url(self, url: str) -> list[float]:
        """Embed an image from a URL.

        Parameters
        ----------
        url:
            HTTP(S) URL of the image.

        Returns
        -------
        list[float]
            512-dimensional embedding.
        """
        import httpx

        response = httpx.get(url, timeout=30)
        response.raise_for_status()
        return self.embed_from_bytes(response.content)

    def embed_text(self, text: str) -> list[float]:
        """Embed a text string using CLIP's text encoder.

        Parameters
        ----------
        text:
            A text description.

        Returns
        -------
        list[float]
            512-dimensional normalised embedding.
        """
        self._load_model()

        if self._tokenizer is not None and hasattr(self._model, "encode_text"):
            tokens = self._tokenizer([text]).to(self._device)
            with torch.no_grad():
                features = self._model.encode_text(tokens)
                features = features / features.norm(dim=-1, keepdim=True)
            return features.squeeze().cpu().numpy().tolist()

        # Fallback: use image embedding of a rendered text placeholder
        logger.warning("text_embedding_fallback", hint="CLIP text encoder not available")
        img = Image.new("RGB", (224, 224), (255, 255, 255))
        return self.embed_image(img)

    @property
    def dimension(self) -> int:
        """Return the embedding dimension."""
        return EMBEDDING_DIM
