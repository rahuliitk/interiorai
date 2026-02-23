"""
VLM image generation tool for the LangGraph design agent.

Calls the VLM API via LiteLLM to generate redesigned room images.
Handles multi-modal prompts (text + source room photo) and parses
the VLM response into structured design output.
"""

from __future__ import annotations

import base64
import json
from typing import Any

import structlog

from openlintel_shared.config import Settings, get_settings
from openlintel_shared.llm import LiteLLMClient
from openlintel_shared.storage import download_file

logger = structlog.get_logger(__name__)


class VLMGenerator:
    """Generates room redesign images and design specifications via VLM APIs.

    Uses LiteLLM to call any supported VLM provider (OpenAI, Google, Anthropic)
    with the user's own API key.

    Parameters
    ----------
    settings:
        Optional settings override.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._llm = LiteLLMClient(settings=self._settings)

    async def generate_design(
        self,
        *,
        model: str,
        prompt: str,
        source_image_key: str | None = None,
        encrypted_key: str,
        iv: str,
        auth_tag: str,
        temperature: float = 0.8,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """Generate a room redesign using the VLM.

        Parameters
        ----------
        model:
            LiteLLM model identifier (e.g. ``"openai/gpt-4o"``).
        prompt:
            The design generation prompt with style, budget, and constraints.
        source_image_key:
            Optional MinIO storage key for the source room photo.
            If provided, the image is included as a multi-modal input.
        encrypted_key:
            User's encrypted API key (hex).
        iv:
            Initialisation vector (hex).
        auth_tag:
            GCM auth tag (hex).
        temperature:
            Sampling temperature (higher = more creative).
        max_tokens:
            Maximum tokens in the response.

        Returns
        -------
        dict
            Parsed VLM response containing:
            - ``"description"``: text description of the design
            - ``"design_spec"``: structured JSON design specification
            - ``"raw_response"``: the raw VLM response text
        """
        messages = self._build_messages(prompt, source_image_key)

        logger.info(
            "vlm_generate_request",
            model=model,
            has_source_image=source_image_key is not None,
            prompt_length=len(prompt),
        )

        response = await self._llm.completion(
            model=model,
            messages=messages,
            encrypted_key=encrypted_key,
            iv=iv,
            auth_tag=auth_tag,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # Extract the text content from the response
        raw_text = ""
        if response.choices and len(response.choices) > 0:
            choice = response.choices[0]
            if hasattr(choice, "message") and choice.message:
                raw_text = choice.message.content or ""

        result = self._parse_response(raw_text)

        logger.info(
            "vlm_generate_response",
            model=model,
            response_length=len(raw_text),
            has_design_spec="design_spec" in result and result["design_spec"] is not None,
        )

        return result

    async def generate_image(
        self,
        *,
        model: str,
        prompt: str,
        source_image_key: str | None = None,
        encrypted_key: str,
        iv: str,
        auth_tag: str,
    ) -> dict[str, Any]:
        """Generate a design image using an image-generation-capable VLM.

        This method is specifically for models that support image output
        (e.g. GPT-4o with image generation, Gemini with Imagen).

        Parameters
        ----------
        model:
            LiteLLM model identifier.
        prompt:
            The image generation prompt.
        source_image_key:
            Optional source room photo key in MinIO.
        encrypted_key:
            User's encrypted API key.
        iv:
            Initialisation vector.
        auth_tag:
            GCM authentication tag.

        Returns
        -------
        dict
            ``{"image_data": base64_str | None, "description": str, "raw_response": str}``
        """
        image_prompt = (
            f"{prompt}\n\n"
            "Generate a photorealistic interior design rendering based on the above description. "
            "The image should be high quality, well-lit, and show the room from a natural viewing angle."
        )

        messages = self._build_messages(image_prompt, source_image_key)

        logger.info(
            "vlm_image_generate_request",
            model=model,
            has_source_image=source_image_key is not None,
        )

        response = await self._llm.completion(
            model=model,
            messages=messages,
            encrypted_key=encrypted_key,
            iv=iv,
            auth_tag=auth_tag,
            temperature=0.9,
            max_tokens=4096,
        )

        raw_text = ""
        image_data: str | None = None

        if response.choices and len(response.choices) > 0:
            choice = response.choices[0]
            if hasattr(choice, "message") and choice.message:
                content = choice.message.content
                if isinstance(content, str):
                    raw_text = content
                elif isinstance(content, list):
                    # Multi-modal response (text + image blocks)
                    for block in content:
                        if isinstance(block, dict):
                            if block.get("type") == "text":
                                raw_text += block.get("text", "")
                            elif block.get("type") == "image_url":
                                url = block.get("image_url", {}).get("url", "")
                                if url.startswith("data:"):
                                    # Extract base64 data from data URL
                                    image_data = url.split(",", 1)[-1]

        return {
            "image_data": image_data,
            "description": raw_text,
            "raw_response": raw_text,
        }

    def _build_messages(
        self,
        prompt: str,
        source_image_key: str | None = None,
    ) -> list[dict[str, Any]]:
        """Build the message payload for the VLM, optionally including an image.

        Parameters
        ----------
        prompt:
            The text prompt.
        source_image_key:
            Optional MinIO key for the source room photo.

        Returns
        -------
        list[dict]
            Messages in OpenAI chat-completion format.
        """
        content: list[dict[str, Any]] = []

        # Include source room photo if available
        if source_image_key:
            try:
                image_bytes = download_file(
                    bucket=self._settings.MINIO_BUCKET,
                    key=source_image_key,
                    settings=self._settings,
                )
                b64_image = base64.b64encode(image_bytes).decode("utf-8")

                # Detect mime type from key extension
                mime_type = "image/jpeg"
                lower_key = source_image_key.lower()
                if lower_key.endswith(".png"):
                    mime_type = "image/png"
                elif lower_key.endswith(".webp"):
                    mime_type = "image/webp"

                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{b64_image}",
                        "detail": "high",
                    },
                })
                logger.info(
                    "vlm_source_image_loaded",
                    storage_key=source_image_key,
                    size_bytes=len(image_bytes),
                )
            except Exception:
                logger.warning(
                    "vlm_source_image_load_failed",
                    storage_key=source_image_key,
                    exc_info=True,
                )

        # Add the text prompt
        content.append({
            "type": "text",
            "text": prompt,
        })

        return [
            {
                "role": "system",
                "content": (
                    "You are an expert interior designer and architect. "
                    "You analyze room photos and generate detailed design proposals. "
                    "When generating designs, you consider spatial constraints, lighting, "
                    "color theory, material compatibility, and budget appropriateness. "
                    "Always output your design specification as structured JSON when asked."
                ),
            },
            {
                "role": "user",
                "content": content,
            },
        ]

    @staticmethod
    def _parse_response(raw_text: str) -> dict[str, Any]:
        """Parse the VLM response into structured output.

        Attempts to extract JSON design specifications from the response.
        Falls back to treating the entire response as a description.

        Parameters
        ----------
        raw_text:
            The raw text from the VLM.

        Returns
        -------
        dict
            Parsed result with ``description``, ``design_spec``, and ``raw_response``.
        """
        design_spec: dict[str, Any] | None = None
        description = raw_text

        # Try to extract JSON from the response (look for ```json blocks)
        if "```json" in raw_text:
            try:
                json_start = raw_text.index("```json") + len("```json")
                json_end = raw_text.index("```", json_start)
                json_str = raw_text[json_start:json_end].strip()
                design_spec = json.loads(json_str)
                # Use text outside the JSON block as description
                description = (
                    raw_text[:raw_text.index("```json")].strip()
                    + "\n"
                    + raw_text[json_end + 3:].strip()
                ).strip()
            except (ValueError, json.JSONDecodeError):
                pass
        elif raw_text.strip().startswith("{"):
            # The entire response might be JSON
            try:
                design_spec = json.loads(raw_text.strip())
                description = design_spec.get("description", raw_text[:200])
            except json.JSONDecodeError:
                pass

        return {
            "description": description,
            "design_spec": design_spec,
            "raw_response": raw_text,
        }
