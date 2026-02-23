"""
LangGraph-based BOM generation agent.

Orchestrates a multi-step pipeline:
  1. extract_materials  -- LLM analyses the design spec to identify materials
  2. calculate_quantities -- compute quantities with waste factors
  3. lookup_prices -- resolve unit prices from the material database
  4. optimize_budget -- OR-Tools budget allocation (if target budget given)
  5. generate_bom -- assemble the final BOM result

Each node mutates a shared ``BOMState`` TypedDict that flows through the graph.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient
from openlintel_shared.schemas.bom import BOMItem, MaterialCategory
from openlintel_shared.schemas.design import BudgetTier

from src.agents.material_db import (
    MATERIAL_DATABASE,
    MaterialSpec,
    get_price_for_tier,
    get_waste_factor,
)
from src.agents.substitution import get_rule_based_substitutions
from src.models.bom import (
    BOMCategorySummary,
    BOMResult,
    BOMStatus,
    BOMSummary,
    OptimizationResult,
    SubstitutionOption,
)
from src.services.calculator import calculate_material_quantities
from src.services.optimizer import optimize_budget_allocation

logger = structlog.get_logger(__name__)


# -- State definition -------------------------------------------------------

class BOMState(TypedDict, total=False):
    """Shared state flowing through the BOM agent graph."""

    # Inputs
    bom_id: str
    project_id: str
    room_id: str
    room_name: str
    room_type: str
    room_dimensions: dict[str, float]
    design_variant_id: str
    design_style: str
    budget_tier: str
    spec_json: dict[str, Any]
    target_budget: float | None
    currency: str
    include_substitutions: bool

    # LLM credentials (passed through)
    encrypted_key: str | None
    iv: str | None
    auth_tag: str | None
    plain_api_key: str | None

    # Intermediate
    extracted_materials: list[dict[str, Any]]
    calculated_items: list[dict[str, Any]]
    priced_items: list[dict[str, Any]]
    optimization_result: dict[str, Any] | None
    substitutions: list[dict[str, Any]]

    # Output
    status: str
    bom_result: dict[str, Any] | None
    error: str | None


# -- Agent implementation ---------------------------------------------------

class BOMAgent(AgentBase):
    """LangGraph agent that generates a Bill of Materials from a design variant.

    The agent uses five sequential nodes connected in a linear pipeline.
    If a ``target_budget`` is provided, the optimizer node runs OR-Tools to
    reallocate spending across categories.
    """

    def __init__(
        self,
        llm_client: LiteLLMClient | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._llm = llm_client or LiteLLMClient()

    def build_graph(self) -> StateGraph:
        """Construct the BOM generation state graph."""
        graph = StateGraph(BOMState)

        graph.add_node("extract_materials", self._extract_materials)
        graph.add_node("calculate_quantities", self._calculate_quantities)
        graph.add_node("lookup_prices", self._lookup_prices)
        graph.add_node("optimize_budget", self._optimize_budget)
        graph.add_node("generate_bom", self._generate_bom)

        graph.set_entry_point("extract_materials")
        graph.add_edge("extract_materials", "calculate_quantities")
        graph.add_edge("calculate_quantities", "lookup_prices")
        graph.add_edge("lookup_prices", "optimize_budget")
        graph.add_edge("optimize_budget", "generate_bom")
        graph.add_edge("generate_bom", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Build the initial state dict from caller-supplied parameters."""
        return {
            "bom_id": kwargs.get("bom_id", str(uuid.uuid4())),
            "project_id": kwargs["project_id"],
            "room_id": kwargs["room_id"],
            "room_name": kwargs.get("room_name", ""),
            "room_type": kwargs["room_type"],
            "room_dimensions": kwargs["room_dimensions"],
            "design_variant_id": kwargs["design_variant_id"],
            "design_style": kwargs.get("design_style", "modern"),
            "budget_tier": kwargs.get("budget_tier", "mid_range"),
            "spec_json": kwargs.get("spec_json", {}),
            "target_budget": kwargs.get("target_budget"),
            "currency": kwargs.get("currency", "INR"),
            "include_substitutions": kwargs.get("include_substitutions", True),
            "encrypted_key": kwargs.get("encrypted_key"),
            "iv": kwargs.get("iv"),
            "auth_tag": kwargs.get("auth_tag"),
            "plain_api_key": kwargs.get("plain_api_key"),
            "extracted_materials": [],
            "calculated_items": [],
            "priced_items": [],
            "optimization_result": None,
            "substitutions": [],
            "status": BOMStatus.PENDING,
            "bom_result": None,
            "error": None,
        }

    # -- Node implementations -----------------------------------------------

    async def _extract_materials(self, state: BOMState) -> dict[str, Any]:
        """Node 1: Use the LLM to analyse the design spec and extract materials."""
        logger.info(
            "bom_extract_materials_start",
            bom_id=state["bom_id"],
            room_type=state["room_type"],
        )

        spec_json = state.get("spec_json", {})
        room_dims = state["room_dimensions"]

        prompt = f"""You are an expert interior designer and quantity surveyor for the Indian market.

Analyse the following design specification for a {state['room_type']} room and extract ALL materials needed.

Room: {state['room_name']} ({state['room_type']})
Dimensions: {room_dims.get('length_mm', 0)}mm L x {room_dims.get('width_mm', 0)}mm W x {room_dims.get('height_mm', 0)}mm H
Design Style: {state['design_style']}
Budget Tier: {state['budget_tier']}

Design Specification:
{json.dumps(spec_json, indent=2, default=str) if spec_json else 'No detailed spec available. Generate a standard BOM for this room type and style.'}

Return a JSON array of materials. Each item must have:
- "material_key": a snake_case identifier matching common materials (e.g. "vitrified_tiles_600x600", "interior_emulsion", "bwr_plywood_18mm", "copper_wire_1_5mm", "gypsum_board_12mm", "led_downlight", "modular_switch_plate", "cpvc_pipe_15mm", "cabinet_hinge_soft_close", "drawer_channel_18inch", "laminate_sheet", "edge_banding_pvc", "wall_putty", "wall_primer")
- "category": one of civil, flooring, painting, electrical, plumbing, carpentry, false_ceiling, glass_aluminum, sanitaryware, appliances, soft_furnishing, decor, hardware
- "name": human-readable material name
- "specification": brief spec description
- "unit": measurement unit (sqft, sqm, nos, rft, bag, pair, etc.)
- "area_or_count": the raw quantity needed based on room dimensions (number)
- "laying_pattern": optional tile laying pattern if applicable (straight, diagonal, herringbone)
- "notes": any special notes

Consider ALL categories relevant to this room type:
- Flooring (tiles, marble, laminate, vinyl)
- Wall treatments (paint, putty, primer, texture, wallpaper)
- Carpentry (plywood, laminates, edge banding for wardrobes/cabinets/shelves)
- Hardware (hinges, channels, handles)
- Electrical (wiring, switches, lights, conduit)
- Plumbing (if bathroom/kitchen)
- False ceiling (if applicable)
- Civil (cement, sand for minor works)

Return ONLY the JSON array, no other text."""

        try:
            response = await self._llm.completion(
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                encrypted_key=state.get("encrypted_key"),
                iv=state.get("iv"),
                auth_tag=state.get("auth_tag"),
                plain_api_key=state.get("plain_api_key"),
                temperature=0.2,
                max_tokens=4000,
            )

            content = response.choices[0].message.content or "[]"
            # Strip markdown code fences if present
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            materials = json.loads(content)
            if not isinstance(materials, list):
                materials = [materials]

            logger.info(
                "bom_extract_materials_complete",
                bom_id=state["bom_id"],
                material_count=len(materials),
            )

            return {
                "extracted_materials": materials,
                "status": BOMStatus.EXTRACTING,
            }

        except Exception as exc:
            logger.error("bom_extract_materials_failed", error=str(exc))
            # Fall back to a default material list for the room type
            fallback = _get_fallback_materials(state["room_type"], state["room_dimensions"])
            return {
                "extracted_materials": fallback,
                "status": BOMStatus.EXTRACTING,
            }

    async def _calculate_quantities(self, state: BOMState) -> dict[str, Any]:
        """Node 2: Calculate precise quantities with waste factors."""
        logger.info("bom_calculate_quantities", bom_id=state["bom_id"])

        calculated = calculate_material_quantities(
            materials=state["extracted_materials"],
            room_dimensions=state["room_dimensions"],
        )

        return {
            "calculated_items": calculated,
            "status": BOMStatus.CALCULATING,
        }

    async def _lookup_prices(self, state: BOMState) -> dict[str, Any]:
        """Node 3: Resolve unit prices from the material database."""
        logger.info("bom_lookup_prices", bom_id=state["bom_id"])

        budget_tier = BudgetTier(state["budget_tier"])
        priced_items: list[dict[str, Any]] = []

        for item in state["calculated_items"]:
            material_key = item.get("material_key", "")
            unit_price = get_price_for_tier(material_key, budget_tier)

            priced_item = {**item}
            if unit_price is not None:
                priced_item["unit_price"] = unit_price
            else:
                # Keep any existing price or mark as needing manual lookup
                priced_item.setdefault("unit_price", None)

            priced_item["currency"] = state.get("currency", "INR")
            priced_items.append(priced_item)

        return {
            "priced_items": priced_items,
            "status": BOMStatus.PRICING,
        }

    async def _optimize_budget(self, state: BOMState) -> dict[str, Any]:
        """Node 4: Optimise budget allocation using OR-Tools if a target is set."""
        logger.info("bom_optimize_budget", bom_id=state["bom_id"])

        target_budget = state.get("target_budget")
        budget_tier = BudgetTier(state["budget_tier"])
        priced_items = state["priced_items"]

        # Generate substitution options
        substitutions: list[dict[str, Any]] = []
        if state.get("include_substitutions", True):
            seen_pairs: set[tuple[str, str]] = set()
            for item in priced_items:
                material_key = item.get("material_key", "")
                if material_key:
                    options = get_rule_based_substitutions(material_key, budget_tier)
                    for opt in options:
                        pair = (opt.original_material, opt.substitute_material)
                        if pair not in seen_pairs:
                            seen_pairs.add(pair)
                            substitutions.append(opt.model_dump())

        # Run OR-Tools optimization if budget target is set
        optimization_result: dict[str, Any] | None = None
        if target_budget is not None and target_budget > 0:
            optimization_result = optimize_budget_allocation(
                items=priced_items,
                target_budget=target_budget,
                budget_tier=budget_tier,
            )
            # If optimization applied substitutions, update the priced items
            if optimization_result and optimization_result.get("optimized_items"):
                priced_items = optimization_result["optimized_items"]

        return {
            "priced_items": priced_items,
            "optimization_result": optimization_result,
            "substitutions": substitutions,
            "status": BOMStatus.OPTIMIZING,
        }

    async def _generate_bom(self, state: BOMState) -> dict[str, Any]:
        """Node 5: Assemble the final BOM result."""
        logger.info("bom_generate_final", bom_id=state["bom_id"])

        now = datetime.now(tz=timezone.utc)
        items: list[BOMItem] = []

        for item_data in state["priced_items"]:
            try:
                category_value = item_data.get("category", "carpentry")
                try:
                    category = MaterialCategory(category_value)
                except ValueError:
                    category = MaterialCategory.CARPENTRY

                waste_factor = item_data.get("waste_factor", 0.05)
                quantity = float(item_data.get("quantity", item_data.get("area_or_count", 0)))

                if quantity <= 0:
                    continue

                bom_item = BOMItem(
                    id=str(uuid.uuid4()),
                    roomId=state["room_id"],
                    category=category,
                    name=item_data.get("name", "Unknown Material"),
                    specification=item_data.get("specification", ""),
                    quantity=quantity,
                    unit=item_data.get("unit", "nos"),
                    unitPrice=item_data.get("unit_price"),
                    currency=item_data.get("currency", state.get("currency", "INR")),
                    wasteFactor=waste_factor,
                )
                items.append(bom_item)
            except Exception:
                logger.warning("bom_item_creation_failed", item=item_data, exc_info=True)
                continue

        # Build summary
        total_cost = sum(item.estimated_cost or 0.0 for item in items)
        category_breakdown = _build_category_breakdown(items, total_cost)

        budget_utilization: float | None = None
        target_budget = state.get("target_budget")
        if target_budget and target_budget > 0:
            budget_utilization = round((total_cost / target_budget) * 100, 1)

        summary = BOMSummary(
            total_items=len(items),
            total_cost=round(total_cost, 2),
            currency=state.get("currency", "INR"),
            category_breakdown=category_breakdown,
            budget_utilization_percent=budget_utilization,
        )

        # Build optimization result model
        opt_data = state.get("optimization_result")
        optimization: OptimizationResult | None = None
        if opt_data:
            subs_applied = [
                SubstitutionOption(**s) for s in opt_data.get("substitutions_applied", [])
            ]
            optimization = OptimizationResult(
                original_total=opt_data.get("original_total", total_cost),
                optimized_total=opt_data.get("optimized_total", total_cost),
                savings=opt_data.get("savings", 0.0),
                savings_percent=opt_data.get("savings_percent", 0.0),
                substitutions_applied=subs_applied,
                solver_status=opt_data.get("solver_status", "NOT_RUN"),
            )

        substitutions = [
            SubstitutionOption(**s) for s in state.get("substitutions", [])
        ]

        bom_result = BOMResult(
            id=state["bom_id"],
            project_id=state["project_id"],
            room_id=state["room_id"],
            design_variant_id=state["design_variant_id"],
            status=BOMStatus.COMPLETE,
            items=items,
            summary=summary,
            optimization=optimization,
            substitutions=substitutions,
            created_at=now,
            completed_at=now,
        )

        return {
            "bom_result": bom_result.model_dump(mode="json"),
            "status": BOMStatus.COMPLETE,
        }


# -- Helper functions -------------------------------------------------------

def _build_category_breakdown(
    items: list[BOMItem],
    total_cost: float,
) -> list[BOMCategorySummary]:
    """Build a per-category cost breakdown."""
    category_totals: dict[MaterialCategory, tuple[int, float]] = {}

    for item in items:
        count, subtotal = category_totals.get(item.category, (0, 0.0))
        cost = item.estimated_cost or 0.0
        category_totals[item.category] = (count + 1, subtotal + cost)

    breakdown: list[BOMCategorySummary] = []
    for cat, (count, subtotal) in sorted(category_totals.items(), key=lambda x: -x[1][1]):
        pct = (subtotal / total_cost * 100) if total_cost > 0 else 0.0
        breakdown.append(
            BOMCategorySummary(
                category=cat,
                item_count=count,
                subtotal=round(subtotal, 2),
                percentage_of_total=round(pct, 1),
            )
        )

    return breakdown


def _get_fallback_materials(
    room_type: str,
    dimensions: dict[str, float],
) -> list[dict[str, Any]]:
    """Return a sensible default material list when the LLM is unavailable.

    Generates basic quantities from room dimensions.
    """
    length_mm = dimensions.get("length_mm", 3000)
    width_mm = dimensions.get("width_mm", 3000)
    height_mm = dimensions.get("height_mm", 2700)

    floor_sqft = (length_mm * width_mm) / (304.8 * 304.8)
    wall_sqft = (2 * (length_mm + width_mm) * height_mm) / (304.8 * 304.8)
    perimeter_rft = (2 * (length_mm + width_mm)) / 304.8

    materials: list[dict[str, Any]] = [
        {
            "material_key": "vitrified_tiles_600x600",
            "category": "flooring",
            "name": "Vitrified Tiles 600x600mm",
            "specification": "Glossy vitrified floor tile",
            "unit": "sqft",
            "area_or_count": round(floor_sqft, 1),
            "laying_pattern": "straight",
        },
        {
            "material_key": "interior_emulsion",
            "category": "painting",
            "name": "Interior Emulsion Paint",
            "specification": "2 coats emulsion with primer and putty",
            "unit": "sqft",
            "area_or_count": round(wall_sqft, 1),
        },
        {
            "material_key": "wall_putty",
            "category": "painting",
            "name": "Wall Putty",
            "specification": "2 coats wall putty",
            "unit": "sqft",
            "area_or_count": round(wall_sqft, 1),
        },
        {
            "material_key": "wall_primer",
            "category": "painting",
            "name": "Wall Primer",
            "specification": "1 coat primer",
            "unit": "sqft",
            "area_or_count": round(wall_sqft, 1),
        },
        {
            "material_key": "copper_wire_1_5mm",
            "category": "electrical",
            "name": "Copper Wire 1.5mm",
            "specification": "FR grade copper wiring for lighting circuits",
            "unit": "rft",
            "area_or_count": round(perimeter_rft * 3, 1),
        },
        {
            "material_key": "copper_wire_2_5mm",
            "category": "electrical",
            "name": "Copper Wire 2.5mm",
            "specification": "FR grade copper wiring for power sockets",
            "unit": "rft",
            "area_or_count": round(perimeter_rft * 2, 1),
        },
        {
            "material_key": "modular_switch_plate",
            "category": "electrical",
            "name": "Modular Switch Plate",
            "specification": "6-module switch plate with cover",
            "unit": "nos",
            "area_or_count": max(2, round(floor_sqft / 50)),
        },
        {
            "material_key": "led_downlight",
            "category": "electrical",
            "name": "LED Downlight 12W",
            "specification": "Recessed LED downlight, 4000K",
            "unit": "nos",
            "area_or_count": max(2, round(floor_sqft / 30)),
        },
        {
            "material_key": "pvc_conduit_20mm",
            "category": "electrical",
            "name": "PVC Conduit 20mm",
            "specification": "Heavy gauge PVC conduit",
            "unit": "rft",
            "area_or_count": round(perimeter_rft * 2, 1),
        },
    ]

    # Add carpentry for relevant rooms
    if room_type in ("bedroom", "living_room", "kitchen", "study"):
        wardrobe_sqft = min(floor_sqft * 0.4, 80)
        materials.extend([
            {
                "material_key": "bwr_plywood_18mm",
                "category": "carpentry",
                "name": "BWR Plywood 18mm",
                "specification": "Boiling Water Resistant plywood for carcass",
                "unit": "sqft",
                "area_or_count": round(wardrobe_sqft, 1),
            },
            {
                "material_key": "laminate_sheet",
                "category": "carpentry",
                "name": "Laminate Sheet (1mm)",
                "specification": "Decorative laminate finish",
                "unit": "sqft",
                "area_or_count": round(wardrobe_sqft * 1.2, 1),
            },
            {
                "material_key": "edge_banding_pvc",
                "category": "carpentry",
                "name": "PVC Edge Banding",
                "specification": "22mm PVC edge tape",
                "unit": "rft",
                "area_or_count": round(wardrobe_sqft * 0.8, 1),
            },
            {
                "material_key": "cabinet_hinge_soft_close",
                "category": "hardware",
                "name": "Soft-Close Cabinet Hinge",
                "specification": "110-degree concealed hinge",
                "unit": "nos",
                "area_or_count": max(4, round(wardrobe_sqft / 8)),
            },
            {
                "material_key": "drawer_channel_18inch",
                "category": "hardware",
                "name": "Drawer Telescopic Channel 18in",
                "specification": "Full-extension ball-bearing slides",
                "unit": "pair",
                "area_or_count": max(2, round(wardrobe_sqft / 20)),
            },
        ])

    # Add plumbing for relevant rooms
    if room_type in ("bathroom", "kitchen", "utility"):
        materials.extend([
            {
                "material_key": "cpvc_pipe_15mm",
                "category": "plumbing",
                "name": "CPVC Pipe 15mm",
                "specification": "Hot and cold water supply pipe",
                "unit": "rft",
                "area_or_count": round(perimeter_rft * 1.5, 1),
            },
            {
                "material_key": "pvc_drainage_75mm",
                "category": "plumbing",
                "name": "PVC Drainage Pipe 75mm",
                "specification": "SWR drainage pipe",
                "unit": "rft",
                "area_or_count": round(perimeter_rft * 0.5, 1),
            },
        ])

    # Add false ceiling for relevant rooms
    if room_type in ("living_room", "bedroom", "dining"):
        materials.append({
            "material_key": "gypsum_board_12mm",
            "category": "false_ceiling",
            "name": "Gypsum Board 12.5mm",
            "specification": "Gypsum false ceiling with GI framework",
            "unit": "sqft",
            "area_or_count": round(floor_sqft * 0.6, 1),
        })

    return materials
