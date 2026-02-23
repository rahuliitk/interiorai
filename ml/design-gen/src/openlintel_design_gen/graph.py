"""
LangGraph StateGraph definition for the design generation pipeline.

The graph orchestrates a multi-step workflow:

1. ``analyze_room`` — VLM reads the room photo and extracts spatial data.
2. ``build_prompt`` — Hydrates a design-generation prompt with style vocabulary.
3. ``generate_design`` — VLM produces a full design specification as JSON.
4. ``evaluate_result`` — A reviewer VLM scores the design.
5. If evaluation fails, loop back to ``build_prompt`` with revision instructions.
6. ``generate_image_prompt`` — Produce a text-to-image prompt for rendering.

Usage::

    graph = DesignGenGraph()
    result = await graph.invoke(
        room_image_url="https://...",
        room_type="living_room",
        style="modern",
        budget_tier="mid_range",
    )
    print(result["design_spec"])
    print(result["image_prompt"])
"""

from __future__ import annotations

import logging
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from openlintel_design_gen.nodes import (
    analyze_room,
    build_prompt,
    evaluate_result,
    generate_design,
    generate_image_prompt,
)

logger = logging.getLogger(__name__)


class DesignGenState(TypedDict, total=False):
    """State schema for the design generation graph.

    All fields are optional (``total=False``) because different nodes
    populate different subsets of the state.
    """

    # -- Inputs --
    room_image_url: str
    room_type: str
    style: str
    budget_tier: str
    model: str
    api_key: str | None

    # -- Room analysis --
    room_analysis: dict[str, Any] | None
    detected_room_type: str

    # -- Prompt construction --
    system_prompt: str
    user_prompt: str

    # -- Design generation --
    design_spec: dict[str, Any] | None
    raw_design_response: str

    # -- Evaluation --
    evaluation: dict[str, Any] | None
    approved: bool
    revision_instructions: str | None
    revision_count: int

    # -- Image prompt --
    image_prompt: str

    # -- Error handling --
    error: str | None


def _should_revise(state: dict[str, Any]) -> str:
    """Routing function: decide whether to revise or finalise.

    Returns the name of the next node:
    - ``"build_prompt"`` if the design was rejected and can be revised.
    - ``"generate_image_prompt"`` if the design was approved.
    - ``"__end__"`` if there was a fatal error.
    """
    if state.get("error") and not state.get("design_spec"):
        return END

    if state.get("approved"):
        return "generate_image_prompt"

    return "build_prompt"


def build_design_gen_graph() -> StateGraph:
    """Construct (but do not compile) the design generation ``StateGraph``.

    Returns
    -------
    StateGraph
        An uncompiled graph that can be compiled with ``.compile()`` or
        extended with additional nodes before compilation.
    """
    graph = StateGraph(DesignGenState)

    # Register nodes
    graph.add_node("analyze_room", analyze_room)
    graph.add_node("build_prompt", build_prompt)
    graph.add_node("generate_design", generate_design)
    graph.add_node("evaluate_result", evaluate_result)
    graph.add_node("generate_image_prompt", generate_image_prompt)

    # Define edges
    graph.set_entry_point("analyze_room")
    graph.add_edge("analyze_room", "build_prompt")
    graph.add_edge("build_prompt", "generate_design")
    graph.add_edge("generate_design", "evaluate_result")

    # Conditional: revise or finalise
    graph.add_conditional_edges(
        "evaluate_result",
        _should_revise,
        {
            "build_prompt": "build_prompt",
            "generate_image_prompt": "generate_image_prompt",
            END: END,
        },
    )

    graph.add_edge("generate_image_prompt", END)

    return graph


class DesignGenGraph:
    """High-level wrapper around the design generation LangGraph.

    Compiles the graph once and provides a clean ``invoke`` / ``astream``
    interface.

    Parameters
    ----------
    max_iterations:
        Recursion limit for the compiled graph (guards against infinite
        revision loops).
    """

    def __init__(self, *, max_iterations: int = 30) -> None:
        self._max_iterations = max_iterations
        self._graph = build_design_gen_graph()
        self._compiled = self._graph.compile()

    async def invoke(
        self,
        *,
        room_image_url: str,
        room_type: str = "living_room",
        style: str = "modern",
        budget_tier: str = "mid_range",
        model: str = "openai/gpt-4o",
        api_key: str | None = None,
    ) -> dict[str, Any]:
        """Run the full design generation pipeline.

        Parameters
        ----------
        room_image_url:
            URL or base64 data-URI of the room photograph.
        room_type:
            Room type slug (e.g. ``"living_room"``).
        style:
            Design style slug (e.g. ``"modern"``).
        budget_tier:
            One of ``economy``, ``mid_range``, ``premium``, ``luxury``.
        model:
            LiteLLM model identifier for VLM calls.
        api_key:
            Optional API key for the VLM provider.

        Returns
        -------
        dict
            Final state containing ``design_spec``, ``evaluation``,
            ``image_prompt``, and all intermediate data.
        """
        initial_state: dict[str, Any] = {
            "room_image_url": room_image_url,
            "room_type": room_type,
            "style": style,
            "budget_tier": budget_tier,
            "model": model,
            "api_key": api_key,
            "revision_count": 0,
            "approved": False,
            "error": None,
        }

        logger.info(
            "Starting design generation: room_type=%s, style=%s, budget=%s",
            room_type,
            style,
            budget_tier,
        )

        result: dict[str, Any] = await self._compiled.ainvoke(
            initial_state,
            config={"recursion_limit": self._max_iterations},
        )

        logger.info(
            "Design generation complete: approved=%s, revisions=%d",
            result.get("approved"),
            result.get("revision_count", 0),
        )

        return result

    async def astream(
        self,
        *,
        room_image_url: str,
        room_type: str = "living_room",
        style: str = "modern",
        budget_tier: str = "mid_range",
        model: str = "openai/gpt-4o",
        api_key: str | None = None,
    ) -> Any:
        """Stream state updates as the pipeline progresses.

        Yields partial state dicts for each node transition, enabling
        real-time progress reporting in the UI.
        """
        initial_state: dict[str, Any] = {
            "room_image_url": room_image_url,
            "room_type": room_type,
            "style": style,
            "budget_tier": budget_tier,
            "model": model,
            "api_key": api_key,
            "revision_count": 0,
            "approved": False,
            "error": None,
        }

        async for step in self._compiled.astream(
            initial_state,
            config={"recursion_limit": self._max_iterations},
        ):
            yield step

    @property
    def graph(self) -> StateGraph:
        """Return the underlying uncompiled ``StateGraph`` for extension."""
        return self._graph
