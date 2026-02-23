"""
LangGraph node implementations for the design generation pipeline.

Each function is a pure graph node: it receives the current ``DesignGenState``
dict and returns a partial state update.  Nodes communicate exclusively
through the state — no side-channels.

Node flow::

    analyze_room -> build_prompt -> generate_design -> evaluate_result
                                                          |
                                        (if not approved) +-> build_prompt (loop)
"""

from __future__ import annotations

import json
import logging
from typing import Any

import litellm

from openlintel_design_gen.prompts import PromptBuilder

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration defaults (overridable via state)
# ---------------------------------------------------------------------------

DEFAULT_VLM_MODEL = "openai/gpt-4o"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 4096
MAX_REVISION_ROUNDS = 3


def _parse_json_response(text: str) -> dict[str, Any]:
    """Extract and parse a JSON object from a VLM response.

    Handles common VLM quirks: markdown fences, leading prose, trailing text.
    """
    cleaned = text.strip()

    # Strip markdown code fences
    if cleaned.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
        # Remove closing fence
        if "```" in cleaned:
            cleaned = cleaned[: cleaned.rindex("```")]
        cleaned = cleaned.strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Find the outermost { ... } block
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from VLM response:\n{text[:500]}")


async def _vlm_call(
    model: str,
    system_prompt: str,
    user_prompt: str,
    *,
    api_key: str | None = None,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    image_url: str | None = None,
) -> str:
    """Make a VLM completion call via LiteLLM.

    Supports multi-modal messages when ``image_url`` is provided.
    """
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
    ]

    if image_url:
        # Multi-modal user message with image
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": image_url},
                },
                {
                    "type": "text",
                    "text": user_prompt,
                },
            ],
        })
    else:
        messages.append({"role": "user", "content": user_prompt})

    call_kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if api_key:
        call_kwargs["api_key"] = api_key

    response = await litellm.acompletion(**call_kwargs)
    return response.choices[0].message.content


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------


async def analyze_room(state: dict[str, Any]) -> dict[str, Any]:
    """Analyse a room photograph to extract spatial and structural information.

    Reads from state
    -----------------
    - ``room_image_url``: URL or base64 data-URI of the room photo.
    - ``room_type`` (optional): If already known, skip detection.
    - ``model`` (optional): VLM model identifier.
    - ``api_key`` (optional): API key for the VLM provider.

    Writes to state
    ----------------
    - ``room_analysis``: Parsed JSON dict with room dimensions, elements, etc.
    - ``detected_room_type``: The room type detected or confirmed.
    - ``error``: Set if analysis fails.
    """
    image_url = state.get("room_image_url")
    model = state.get("model", DEFAULT_VLM_MODEL)
    api_key = state.get("api_key")

    if not image_url:
        return {
            "error": "No room_image_url provided in state",
            "room_analysis": None,
        }

    system_prompt, user_prompt = PromptBuilder.room_analysis()

    try:
        raw_response = await _vlm_call(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            api_key=api_key,
            image_url=image_url,
            temperature=0.3,  # Lower temperature for factual analysis
        )

        analysis = _parse_json_response(raw_response)

        # Use provided room type as override, or accept detected one
        detected_type = state.get("room_type") or analysis.get("room_type", "other")

        logger.info(
            "Room analysis complete: type=%s, elements=%d",
            detected_type,
            len(analysis.get("existing_elements", [])),
        )

        return {
            "room_analysis": analysis,
            "detected_room_type": detected_type,
        }

    except Exception as exc:
        logger.error("Room analysis failed: %s", exc)
        return {
            "error": f"Room analysis failed: {exc}",
            "room_analysis": None,
        }


async def build_prompt(state: dict[str, Any]) -> dict[str, Any]:
    """Construct the design-generation prompt from room analysis and style config.

    Reads from state
    -----------------
    - ``room_analysis``: Dict from ``analyze_room``.
    - ``detected_room_type``: Room type string.
    - ``style``: Design style slug.
    - ``budget_tier``: Budget tier string.
    - ``revision_instructions`` (optional): Feedback from evaluation.

    Writes to state
    ----------------
    - ``system_prompt``: System prompt string.
    - ``user_prompt``: User prompt string.
    """
    room_analysis = state.get("room_analysis", {})
    room_type = state.get("detected_room_type", "living_room")
    style_slug = state.get("style", "modern")
    budget_tier = state.get("budget_tier", "mid_range")
    revision_instructions = state.get("revision_instructions")

    system_prompt, user_prompt = PromptBuilder.design_generation(
        room_type=room_type,
        style_slug=style_slug,
        budget_tier=budget_tier,
        room_analysis_json=json.dumps(room_analysis, indent=2),
    )

    # If we have revision instructions from a failed evaluation, append them
    if revision_instructions:
        user_prompt += (
            f"\n\n--- REVISION REQUIRED ---\n"
            f"The previous design was rejected.  Apply these corrections:\n"
            f"{revision_instructions}\n"
            f"Generate a corrected design specification."
        )

    return {
        "system_prompt": system_prompt,
        "user_prompt": user_prompt,
    }


async def generate_design(state: dict[str, Any]) -> dict[str, Any]:
    """Call the VLM to generate a complete design specification.

    Reads from state
    -----------------
    - ``system_prompt``, ``user_prompt``: From ``build_prompt``.
    - ``room_image_url`` (optional): Included for visual context.
    - ``model``, ``api_key`` (optional): VLM config.

    Writes to state
    ----------------
    - ``design_spec``: Parsed JSON design specification.
    - ``raw_design_response``: Raw VLM text (for debugging).
    - ``error``: Set if generation fails.
    """
    system_prompt = state.get("system_prompt", "")
    user_prompt = state.get("user_prompt", "")
    image_url = state.get("room_image_url")
    model = state.get("model", DEFAULT_VLM_MODEL)
    api_key = state.get("api_key")

    try:
        raw_response = await _vlm_call(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            api_key=api_key,
            image_url=image_url,
            temperature=0.7,
            max_tokens=8192,
        )

        design_spec = _parse_json_response(raw_response)

        logger.info(
            "Design generated: name=%s, furniture_count=%d",
            design_spec.get("design_name", "unnamed"),
            len(design_spec.get("furniture", [])),
        )

        return {
            "design_spec": design_spec,
            "raw_design_response": raw_response,
        }

    except Exception as exc:
        logger.error("Design generation failed: %s", exc)
        return {
            "error": f"Design generation failed: {exc}",
            "design_spec": None,
        }


async def evaluate_result(state: dict[str, Any]) -> dict[str, Any]:
    """Evaluate the generated design against quality criteria.

    Uses a separate VLM call to act as a "design reviewer" that scores
    the output on style coherence, spatial feasibility, budget adherence,
    and more.

    Reads from state
    -----------------
    - ``design_spec``: The generated design.
    - ``room_analysis``: Original room analysis.
    - ``style``, ``budget_tier``: Requirements.
    - ``model``, ``api_key``: VLM config.
    - ``revision_count``: How many revisions have been attempted.

    Writes to state
    ----------------
    - ``evaluation``: Parsed evaluation JSON.
    - ``approved``: Boolean — whether the design passed QA.
    - ``revision_instructions``: If not approved, what to fix.
    - ``revision_count``: Incremented counter.
    """
    design_spec = state.get("design_spec")
    room_analysis = state.get("room_analysis", {})
    style_slug = state.get("style", "modern")
    budget_tier = state.get("budget_tier", "mid_range")
    model = state.get("model", DEFAULT_VLM_MODEL)
    api_key = state.get("api_key")
    revision_count = state.get("revision_count", 0)

    # If design generation failed, skip evaluation
    if not design_spec:
        return {
            "approved": False,
            "evaluation": None,
            "revision_instructions": "Design generation failed — retry from scratch.",
            "revision_count": revision_count + 1,
        }

    # If we have exhausted revision rounds, auto-approve to avoid infinite loops
    if revision_count >= MAX_REVISION_ROUNDS:
        logger.warning(
            "Max revision rounds (%d) reached — auto-approving design.",
            MAX_REVISION_ROUNDS,
        )
        return {
            "approved": True,
            "evaluation": {
                "scores": {"overall": 6},
                "issues": [],
                "approved": True,
                "revision_instructions": "Auto-approved after max revisions.",
            },
            "revision_count": revision_count,
        }

    system_prompt, user_prompt = PromptBuilder.evaluation(
        style_slug=style_slug,
        budget_tier=budget_tier,
        room_analysis_json=json.dumps(room_analysis, indent=2),
        design_spec_json=json.dumps(design_spec, indent=2),
    )

    try:
        raw_response = await _vlm_call(
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            api_key=api_key,
            temperature=0.2,  # Deterministic evaluation
        )

        evaluation = _parse_json_response(raw_response)
        approved = evaluation.get("approved", False)
        revision_instr = evaluation.get("revision_instructions", "")

        overall_score = evaluation.get("scores", {}).get("overall", 0)
        logger.info(
            "Design evaluation: approved=%s, overall_score=%d, revision=%d",
            approved,
            overall_score,
            revision_count,
        )

        return {
            "evaluation": evaluation,
            "approved": approved,
            "revision_instructions": revision_instr if not approved else None,
            "revision_count": revision_count + 1,
        }

    except Exception as exc:
        logger.error("Evaluation failed: %s", exc)
        # On evaluation failure, approve the design rather than loop forever
        return {
            "approved": True,
            "evaluation": None,
            "revision_instructions": None,
            "revision_count": revision_count + 1,
        }


async def generate_image_prompt(state: dict[str, Any]) -> dict[str, Any]:
    """Build a text-to-image prompt from the approved design spec.

    This is an optional final node that produces a prompt suitable for
    Stable Diffusion, DALL-E, or similar image generation APIs.

    Reads from state
    -----------------
    - ``design_spec``: Approved design specification.
    - ``detected_room_type``, ``style``, ``budget_tier``.

    Writes to state
    ----------------
    - ``image_prompt``: The text-to-image prompt string.
    """
    design_spec = state.get("design_spec", {})
    room_type = state.get("detected_room_type", "living_room")
    style_slug = state.get("style", "modern")
    budget_tier = state.get("budget_tier", "mid_range")

    prompt = PromptBuilder.image_generation(
        room_type=room_type,
        style_slug=style_slug,
        budget_tier=budget_tier,
        design_spec=design_spec,
    )

    return {"image_prompt": prompt}
