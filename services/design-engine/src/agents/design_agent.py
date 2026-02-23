"""
LangGraph design generation agent.

Implements a multi-step design generation pipeline as a StateGraph:

    analyze_room -> build_prompt -> generate_design -> evaluate_result
                       ^                                    |
                       |____ (if fail & iterations < 3) ____|

Each node operates on a shared ``DesignState`` typed dict and the graph
uses conditional edges to decide whether to accept the result or loop
back for refinement.
"""

from __future__ import annotations

from typing import Any, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from openlintel_shared.llm.agent_base import AgentBase

from src.agents.evaluator import DesignEvaluator, EvaluationResult
from src.agents.prompt_builder import PromptBuilder
from src.tools.room_analyzer import RoomAnalyzer
from src.tools.vlm_generate import VLMGenerator

logger = structlog.get_logger(__name__)

# Maximum number of generate -> evaluate -> refine loops
MAX_REFINEMENT_ITERATIONS = 3


class DesignState(TypedDict, total=False):
    """State flowing through the design generation graph.

    Every key is optional (``total=False``) because different nodes
    populate different fields.
    """

    # ── Inputs (set before graph starts) ──────────────────────────────────
    room_data: dict[str, Any]           # Row from the rooms table
    style: str                          # DesignStyle value
    budget_tier: str                    # BudgetTier value
    constraints: list[str]              # User constraints
    source_upload_key: str | None       # MinIO key for room photo
    model: str                          # LiteLLM model identifier
    encrypted_key: str                  # Encrypted API key material
    iv: str
    auth_tag: str
    variant_index: int                  # Which variant (0-based)

    # ── Intermediate state ────────────────────────────────────────────────
    room_context: dict[str, Any]        # Room analysis result
    prompt: str                         # Current VLM prompt
    generated_result: dict[str, Any]    # VLM generation output
    evaluation: dict[str, Any]          # Evaluation result dict
    iteration_count: int                # Current refinement iteration

    # ── Outputs ───────────────────────────────────────────────────────────
    final_description: str
    final_spec: dict[str, Any] | None
    final_image_data: str | None        # Base64 image if available
    success: bool
    error: str | None


class DesignAgent(AgentBase):
    """LangGraph agent for room design generation.

    Implements the ``AgentBase`` interface with a four-node graph:
    ``analyze_room`` -> ``build_prompt`` -> ``generate_design`` -> ``evaluate_result``.

    Parameters
    ----------
    max_iterations:
        Hard ceiling for LangGraph recursion limit.
    max_retries:
        Number of times to retry the entire graph on failure.
    """

    def __init__(
        self,
        *,
        max_iterations: int = 25,
        max_retries: int = 2,
    ) -> None:
        super().__init__(
            max_iterations=max_iterations,
            max_retries=max_retries,
            retry_base_delay=2.0,
        )
        self._room_analyzer = RoomAnalyzer()
        self._prompt_builder = PromptBuilder()
        self._vlm_generator = VLMGenerator()
        self._evaluator = DesignEvaluator()

    # ── AgentBase interface ───────────────────────────────────────────────

    def build_graph(self) -> StateGraph:
        """Construct the design generation StateGraph.

        Graph topology::

            analyze_room -> build_prompt -> generate_design -> evaluate_result
                                ^                                    |
                                |____ (fail & iter < max) ___________|
                                                                     |
                                                            (pass) -> END
        """
        graph = StateGraph(DesignState)

        # Add nodes
        graph.add_node("analyze_room", self._node_analyze_room)
        graph.add_node("build_prompt", self._node_build_prompt)
        graph.add_node("generate_design", self._node_generate_design)
        graph.add_node("evaluate_result", self._node_evaluate_result)

        # Set entry point
        graph.set_entry_point("analyze_room")

        # Linear edges
        graph.add_edge("analyze_room", "build_prompt")
        graph.add_edge("build_prompt", "generate_design")
        graph.add_edge("generate_design", "evaluate_result")

        # Conditional edge: evaluate_result -> END or build_prompt
        graph.add_conditional_edges(
            "evaluate_result",
            self._should_refine,
            {
                "refine": "build_prompt",
                "accept": END,
            },
        )

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Build the initial state for a design generation run.

        Parameters
        ----------
        **kwargs:
            Must include: ``room_data``, ``style``, ``budget_tier``,
            ``constraints``, ``source_upload_key``, ``model``,
            ``encrypted_key``, ``iv``, ``auth_tag``, ``variant_index``.
        """
        return {
            "room_data": kwargs["room_data"],
            "style": kwargs["style"],
            "budget_tier": kwargs["budget_tier"],
            "constraints": kwargs.get("constraints", []),
            "source_upload_key": kwargs.get("source_upload_key"),
            "model": kwargs["model"],
            "encrypted_key": kwargs["encrypted_key"],
            "iv": kwargs["iv"],
            "auth_tag": kwargs["auth_tag"],
            "variant_index": kwargs.get("variant_index", 0),
            "room_context": {},
            "prompt": "",
            "generated_result": {},
            "evaluation": {},
            "iteration_count": 0,
            "final_description": "",
            "final_spec": None,
            "final_image_data": None,
            "success": False,
            "error": None,
        }

    # ── Graph nodes ───────────────────────────────────────────────────────

    async def _node_analyze_room(self, state: DesignState) -> dict[str, Any]:
        """Node: Analyze the room photo for spatial context.

        If no source image is available, builds a minimal context from
        database metadata.
        """
        logger.info("node_analyze_room", room_id=state["room_data"].get("id"))

        source_key = state.get("source_upload_key")

        if not source_key:
            # No photo — build context from DB metadata alone
            room = state["room_data"]
            return {
                "room_context": RoomAnalyzer._fallback_analysis(room),
            }

        analysis = await self._room_analyzer.analyze(
            model=state["model"],
            source_image_key=source_key,
            encrypted_key=state["encrypted_key"],
            iv=state["iv"],
            auth_tag=state["auth_tag"],
            room_metadata=state["room_data"],
        )

        return {"room_context": analysis}

    async def _node_build_prompt(self, state: DesignState) -> dict[str, Any]:
        """Node: Build the VLM prompt from context, style, budget, constraints.

        On subsequent iterations (refinement loop), incorporates evaluation
        feedback into the prompt.
        """
        iteration = state.get("iteration_count", 0)
        logger.info("node_build_prompt", iteration=iteration)

        from openlintel_shared.schemas.design import BudgetTier, DesignStyle

        style = DesignStyle(state["style"])
        budget = BudgetTier(state["budget_tier"])
        room = state["room_data"]

        # Build dimensions dict from room data
        dimensions: dict[str, float] | None = None
        if room.get("length_mm") and room.get("width_mm"):
            dimensions = {
                "length_mm": float(room["length_mm"]),
                "width_mm": float(room["width_mm"]),
                "height_mm": float(room.get("height_mm") or 2700),
            }

        prompt = self._prompt_builder.build_design_prompt(
            style=style,
            budget_tier=budget,
            room_type=room.get("type", "other"),
            constraints=state.get("constraints", []),
            room_analysis=state.get("room_context"),
            room_name=room.get("name", ""),
            dimensions=dimensions,
            variant_index=state.get("variant_index", 0),
        )

        # If this is a refinement iteration, append evaluation feedback
        if iteration > 0:
            evaluation = state.get("evaluation", {})
            feedback = evaluation.get("refinement_feedback", "")
            if feedback:
                prompt = self._prompt_builder.build_refinement_prompt(
                    original_prompt=prompt,
                    evaluation_feedback=feedback,
                    iteration=iteration,
                )

        return {"prompt": prompt}

    async def _node_generate_design(self, state: DesignState) -> dict[str, Any]:
        """Node: Call the VLM to generate the design."""
        iteration = state.get("iteration_count", 0)
        logger.info(
            "node_generate_design",
            model=state["model"],
            iteration=iteration,
            prompt_length=len(state.get("prompt", "")),
        )

        try:
            result = await self._vlm_generator.generate_design(
                model=state["model"],
                prompt=state["prompt"],
                source_image_key=state.get("source_upload_key"),
                encrypted_key=state["encrypted_key"],
                iv=state["iv"],
                auth_tag=state["auth_tag"],
                temperature=0.8 + (iteration * 0.05),  # Slightly increase creativity each iteration
            )

            return {"generated_result": result}

        except Exception as exc:
            logger.exception("node_generate_design_failed")
            return {
                "generated_result": {
                    "description": "",
                    "design_spec": None,
                    "raw_response": "",
                    "error": str(exc),
                },
                "success": False,
                "error": f"VLM generation failed: {exc}",
            }

    async def _node_evaluate_result(self, state: DesignState) -> dict[str, Any]:
        """Node: Evaluate the generated design for quality and compliance."""
        iteration = state.get("iteration_count", 0)
        generated = state.get("generated_result", {})

        # If generation itself failed, skip evaluation
        if generated.get("error"):
            return {
                "evaluation": {"pass": False, "refinement_feedback": "Generation failed"},
                "iteration_count": iteration + 1,
                "success": False,
                "error": generated["error"],
            }

        logger.info("node_evaluate_result", iteration=iteration)

        from openlintel_shared.schemas.design import BudgetTier, DesignStyle

        try:
            eval_result: EvaluationResult = await self._evaluator.evaluate(
                model=state["model"],
                design_description=generated.get("description", ""),
                design_spec=generated.get("design_spec"),
                style=DesignStyle(state["style"]),
                budget_tier=BudgetTier(state["budget_tier"]),
                room_type=state["room_data"].get("type", "other"),
                constraints=state.get("constraints", []),
                encrypted_key=state["encrypted_key"],
                iv=state["iv"],
                auth_tag=state["auth_tag"],
            )

            evaluation_dict = eval_result.to_dict()

            updates: dict[str, Any] = {
                "evaluation": evaluation_dict,
                "iteration_count": iteration + 1,
            }

            if eval_result.passed:
                updates["success"] = True
                updates["final_description"] = generated.get("description", "")
                updates["final_spec"] = generated.get("design_spec")
                updates["error"] = None

            return updates

        except Exception as exc:
            logger.exception("node_evaluate_result_failed")
            # On evaluation failure, accept the design to avoid infinite loops
            return {
                "evaluation": {"pass": True, "evaluation_error": True},
                "iteration_count": iteration + 1,
                "success": True,
                "final_description": generated.get("description", ""),
                "final_spec": generated.get("design_spec"),
                "error": None,
            }

    # ── Conditional edge ──────────────────────────────────────────────────

    @staticmethod
    def _should_refine(state: DesignState) -> str:
        """Decide whether to refine or accept the current design.

        Returns ``"refine"`` if the evaluation failed and we have not
        exceeded ``MAX_REFINEMENT_ITERATIONS``.  Otherwise ``"accept"``.
        """
        evaluation = state.get("evaluation", {})
        passed = evaluation.get("passed", False)
        iteration = state.get("iteration_count", 0)

        if passed:
            return "accept"

        if iteration >= MAX_REFINEMENT_ITERATIONS:
            logger.warning(
                "design_max_iterations_reached",
                iteration=iteration,
                max=MAX_REFINEMENT_ITERATIONS,
            )
            return "accept"

        logger.info(
            "design_refinement_needed",
            iteration=iteration,
            feedback=evaluation.get("refinement_feedback", "")[:200],
        )
        return "refine"
