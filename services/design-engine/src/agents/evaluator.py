"""
Design evaluator for the LangGraph design agent.

Uses an LLM to assess generated designs for quality and constraint compliance.
Returns a pass/fail verdict with detailed feedback for refinement.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from openlintel_shared.config import Settings, get_settings
from openlintel_shared.llm import LiteLLMClient
from openlintel_shared.schemas.design import BudgetTier, DesignStyle

logger = structlog.get_logger(__name__)


_EVALUATION_PROMPT_TEMPLATE = """\
You are an expert interior design critic and quality evaluator.

Evaluate the following design proposal against the specified requirements.
Be thorough but fair — the design does not need to be perfect, but it must
be professional-quality and meet all mandatory constraints.

## Design Requirements
- **Style**: {style}
- **Budget Tier**: {budget_tier}
- **Room Type**: {room_type}
- **Constraints**: {constraints}

## Design Proposal
{design_description}

## Design Specification
{design_spec}

## Evaluation Criteria

Rate each criterion from 1-5 (1=poor, 5=excellent) and provide a brief justification:

1. **Style Match**: Does the design authentically represent the requested {style} style?
2. **Budget Appropriateness**: Are material/furniture choices appropriate for the {budget_tier} tier?
3. **Spatial Feasibility**: Do the furniture placements and proportions make physical sense for the room?
4. **Constraint Compliance**: Does the design respect ALL mandatory constraints? (CRITICAL — any violation = fail)
5. **Cohesion**: Do all elements work together as a unified design? Color palette, materials, and style consistency.
6. **Practicality**: Is the design functional and livable? Proper circulation, adequate storage, good lighting.
7. **Completeness**: Does the specification include enough detail for implementation?

## Required Output Format

Respond with a JSON object:

```json
{{
  "scores": {{
    "style_match": {{"score": <1-5>, "justification": "<brief reason>"}},
    "budget_appropriateness": {{"score": <1-5>, "justification": "<brief reason>"}},
    "spatial_feasibility": {{"score": <1-5>, "justification": "<brief reason>"}},
    "constraint_compliance": {{"score": <1-5>, "justification": "<brief reason>"}},
    "cohesion": {{"score": <1-5>, "justification": "<brief reason>"}},
    "practicality": {{"score": <1-5>, "justification": "<brief reason>"}},
    "completeness": {{"score": <1-5>, "justification": "<brief reason>"}}
  }},
  "overall_score": <float 1.0-5.0>,
  "pass": <true|false>,
  "strengths": ["<list of strengths>"],
  "issues": ["<list of specific issues to fix>"],
  "refinement_feedback": "<detailed feedback for the next iteration if pass=false>"
}}
```

**Pass threshold**: overall_score >= 3.0 AND constraint_compliance.score >= 4.
Any constraint violation is an automatic fail regardless of overall score.
"""


class EvaluationResult:
    """Structured result from a design evaluation.

    Attributes
    ----------
    passed:
        Whether the design passed evaluation.
    overall_score:
        Average score across all criteria (1.0-5.0).
    scores:
        Individual criterion scores and justifications.
    strengths:
        List of design strengths.
    issues:
        List of issues requiring attention.
    refinement_feedback:
        Detailed feedback for the agent to improve the design (only
        meaningful when ``passed`` is ``False``).
    raw_evaluation:
        The raw evaluation JSON from the LLM.
    """

    def __init__(self, data: dict[str, Any]) -> None:
        self.raw_evaluation = data
        self.passed: bool = data.get("pass", False)
        self.overall_score: float = data.get("overall_score", 0.0)
        self.scores: dict[str, Any] = data.get("scores", {})
        self.strengths: list[str] = data.get("strengths", [])
        self.issues: list[str] = data.get("issues", [])
        self.refinement_feedback: str = data.get("refinement_feedback", "")

    def to_dict(self) -> dict[str, Any]:
        """Serialise to a plain dict for storage."""
        return {
            "passed": self.passed,
            "overall_score": self.overall_score,
            "scores": self.scores,
            "strengths": self.strengths,
            "issues": self.issues,
            "refinement_feedback": self.refinement_feedback,
        }


class DesignEvaluator:
    """Evaluates generated designs for quality and constraint compliance.

    Uses an LLM (not necessarily the same model as the generator) to
    critically assess design proposals and provide refinement feedback.

    Parameters
    ----------
    settings:
        Optional settings override.
    """

    # Minimum overall score to pass
    PASS_THRESHOLD: float = 3.0
    # Minimum constraint compliance score to pass
    CONSTRAINT_MIN_SCORE: int = 4

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._llm = LiteLLMClient(settings=self._settings)

    async def evaluate(
        self,
        *,
        model: str,
        design_description: str,
        design_spec: dict[str, Any] | None,
        style: DesignStyle,
        budget_tier: BudgetTier,
        room_type: str,
        constraints: list[str],
        encrypted_key: str,
        iv: str,
        auth_tag: str,
    ) -> EvaluationResult:
        """Evaluate a generated design against requirements.

        Parameters
        ----------
        model:
            LiteLLM model identifier for the evaluator LLM.
        design_description:
            Text description of the generated design.
        design_spec:
            Structured JSON specification (may be ``None`` if parsing failed).
        style:
            Requested design style.
        budget_tier:
            Requested budget bracket.
        room_type:
            Room type string.
        constraints:
            User-specified mandatory constraints.
        encrypted_key:
            Encrypted API key.
        iv:
            Initialisation vector.
        auth_tag:
            GCM auth tag.

        Returns
        -------
        EvaluationResult
            Structured evaluation with pass/fail, scores, and feedback.
        """
        logger.info(
            "design_evaluation_start",
            style=style.value,
            budget_tier=budget_tier.value,
            room_type=room_type,
            constraint_count=len(constraints),
        )

        constraints_str = "\n".join(f"  - {c}" for c in constraints) if constraints else "  (none)"
        spec_str = json.dumps(design_spec, indent=2) if design_spec else "(no structured spec provided)"

        prompt = _EVALUATION_PROMPT_TEMPLATE.format(
            style=style.value.replace("_", " ").title(),
            budget_tier=budget_tier.value.replace("_", " ").title(),
            room_type=room_type.replace("_", " ").title(),
            constraints=constraints_str,
            design_description=design_description,
            design_spec=spec_str,
        )

        try:
            response = await self._llm.completion(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a strict interior design quality evaluator. "
                            "Always respond with valid JSON matching the requested format. "
                            "Be fair but rigorous — especially about constraint compliance."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                encrypted_key=encrypted_key,
                iv=iv,
                auth_tag=auth_tag,
                temperature=0.2,  # Low temperature for consistent evaluation
                max_tokens=2000,
            )

            raw_text = ""
            if response.choices and len(response.choices) > 0:
                choice = response.choices[0]
                if hasattr(choice, "message") and choice.message:
                    raw_text = choice.message.content or ""

            evaluation_data = self._parse_evaluation(raw_text)

            # Enforce pass threshold rules
            overall = evaluation_data.get("overall_score", 0)
            constraint_score = (
                evaluation_data.get("scores", {})
                .get("constraint_compliance", {})
                .get("score", 0)
            )

            if overall < self.PASS_THRESHOLD or constraint_score < self.CONSTRAINT_MIN_SCORE:
                evaluation_data["pass"] = False
                if constraint_score < self.CONSTRAINT_MIN_SCORE:
                    evaluation_data.setdefault("issues", []).insert(
                        0, "Constraint compliance score below minimum threshold"
                    )

            result = EvaluationResult(evaluation_data)

            logger.info(
                "design_evaluation_complete",
                passed=result.passed,
                overall_score=result.overall_score,
                constraint_score=constraint_score,
                issue_count=len(result.issues),
            )

            return result

        except Exception:
            logger.exception("design_evaluation_failed")
            # On evaluation failure, pass the design through to avoid blocking
            return EvaluationResult({
                "pass": True,
                "overall_score": 3.0,
                "scores": {},
                "strengths": [],
                "issues": ["Evaluation failed — design passed by default"],
                "refinement_feedback": "",
                "evaluation_error": True,
            })

    @staticmethod
    def _parse_evaluation(raw_text: str) -> dict[str, Any]:
        """Parse the evaluation LLM response into structured JSON.

        Parameters
        ----------
        raw_text:
            Raw text from the LLM.

        Returns
        -------
        dict
            Parsed evaluation data.
        """
        # Try extracting from ```json blocks
        if "```json" in raw_text:
            try:
                json_start = raw_text.index("```json") + len("```json")
                json_end = raw_text.index("```", json_start)
                json_str = raw_text[json_start:json_end].strip()
                return json.loads(json_str)
            except (ValueError, json.JSONDecodeError):
                pass

        # Try parsing the whole response
        try:
            return json.loads(raw_text.strip())
        except json.JSONDecodeError:
            pass

        # Parsing failed — return a cautious fail to trigger refinement
        return {
            "pass": False,
            "overall_score": 2.0,
            "scores": {},
            "strengths": [],
            "issues": ["Evaluation response could not be parsed"],
            "refinement_feedback": (
                "The evaluation system could not parse the design. "
                "Please ensure the design specification is complete and well-structured."
            ),
        }
