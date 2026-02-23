"""
LangGraph-based procurement agent.

Orchestrates a multi-step pipeline:
  1. group_by_category    -- Group BOM items by material category
  2. select_vendors       -- Use LLM + heuristics for vendor selection
  3. optimise_split       -- OR-Tools multi-vendor optimisation
  4. create_purchase_orders -- Assemble final POs

Each node mutates a shared ``ProcurementState`` TypedDict.
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, TypedDict

import structlog
from langgraph.graph import END, StateGraph

from openlintel_shared.llm import AgentBase, LiteLLMClient

from src.models.order import (
    OrderItem,
    OrderPriority,
    OrderStatus,
    PurchaseOrder,
    Vendor,
    VendorTier,
)
from src.services.order_splitter import optimise_vendor_split

logger = structlog.get_logger(__name__)


# -- Default vendors (used when no vendor list is provided) -----------------

DEFAULT_VENDORS: list[dict[str, Any]] = [
    {
        "id": "vendor_civil_01",
        "name": "BuildMart India",
        "category": "civil",
        "city": "Mumbai",
        "tier": "preferred",
        "lead_time_days": 3,
        "minimum_order_value": 5000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 500,
        "rating": 4.5,
    },
    {
        "id": "vendor_flooring_01",
        "name": "TileWorld",
        "category": "flooring",
        "city": "Morbi",
        "tier": "preferred",
        "lead_time_days": 7,
        "minimum_order_value": 10000,
        "minimum_order_quantity": 10,
        "shipping_cost_flat": 1500,
        "rating": 4.3,
    },
    {
        "id": "vendor_paint_01",
        "name": "ColourCraft Distributors",
        "category": "painting",
        "city": "Delhi",
        "tier": "approved",
        "lead_time_days": 2,
        "minimum_order_value": 3000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 300,
        "rating": 4.0,
    },
    {
        "id": "vendor_electrical_01",
        "name": "PowerLine Electricals",
        "category": "electrical",
        "city": "Bangalore",
        "tier": "preferred",
        "lead_time_days": 3,
        "minimum_order_value": 5000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 400,
        "rating": 4.2,
    },
    {
        "id": "vendor_plumbing_01",
        "name": "AquaFit Plumbing",
        "category": "plumbing",
        "city": "Pune",
        "tier": "approved",
        "lead_time_days": 4,
        "minimum_order_value": 5000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 500,
        "rating": 3.8,
    },
    {
        "id": "vendor_carpentry_01",
        "name": "WoodCraft Solutions",
        "category": "carpentry",
        "city": "Jaipur",
        "tier": "preferred",
        "lead_time_days": 10,
        "minimum_order_value": 15000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 2000,
        "rating": 4.4,
    },
    {
        "id": "vendor_hardware_01",
        "name": "Hettich India (Distributor)",
        "category": "hardware",
        "city": "Mumbai",
        "tier": "preferred",
        "lead_time_days": 5,
        "minimum_order_value": 3000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 350,
        "rating": 4.6,
    },
    {
        "id": "vendor_ceiling_01",
        "name": "GypsumKing",
        "category": "false_ceiling",
        "city": "Hyderabad",
        "tier": "approved",
        "lead_time_days": 5,
        "minimum_order_value": 8000,
        "minimum_order_quantity": 10,
        "shipping_cost_flat": 800,
        "rating": 3.9,
    },
    {
        "id": "vendor_sanitary_01",
        "name": "BathFit India",
        "category": "sanitaryware",
        "city": "Chennai",
        "tier": "approved",
        "lead_time_days": 7,
        "minimum_order_value": 10000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 1200,
        "rating": 4.1,
    },
    {
        "id": "vendor_furnishing_01",
        "name": "SoftTouch Furnishings",
        "category": "soft_furnishing",
        "city": "Delhi",
        "tier": "standard",
        "lead_time_days": 10,
        "minimum_order_value": 5000,
        "minimum_order_quantity": 1,
        "shipping_cost_flat": 600,
        "rating": 3.7,
    },
]


# -- State definition -------------------------------------------------------


class ProcurementState(TypedDict, total=False):
    """Shared state flowing through the procurement agent graph."""

    # Inputs
    project_id: str
    bom_items: list[dict[str, Any]]
    vendors: list[dict[str, Any]]
    target_budget: float | None
    currency: str

    # LLM credentials
    encrypted_key: str | None
    iv: str | None
    auth_tag: str | None
    plain_api_key: str | None

    # Intermediate
    category_groups: dict[str, list[dict[str, Any]]]
    vendor_recommendations: dict[str, list[str]]
    split_assignments: list[dict[str, Any]]

    # Output
    purchase_orders: list[dict[str, Any]]
    total_order_value: float
    total_shipping: float
    error: str | None


# -- Agent implementation ---------------------------------------------------


class ProcurementAgent(AgentBase):
    """LangGraph agent that generates purchase orders from BOM items.

    Groups BOM items by category, selects vendors using LLM reasoning and
    heuristics, optimises the split across vendors using OR-Tools, and
    assembles final purchase orders.
    """

    def __init__(
        self,
        llm_client: LiteLLMClient | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self._llm = llm_client or LiteLLMClient()

    def build_graph(self) -> StateGraph:
        """Construct the procurement state graph."""
        graph = StateGraph(ProcurementState)

        graph.add_node("group_by_category", self._group_by_category)
        graph.add_node("select_vendors", self._select_vendors)
        graph.add_node("optimise_split", self._optimise_split)
        graph.add_node("create_purchase_orders", self._create_purchase_orders)

        graph.set_entry_point("group_by_category")
        graph.add_edge("group_by_category", "select_vendors")
        graph.add_edge("select_vendors", "optimise_split")
        graph.add_edge("optimise_split", "create_purchase_orders")
        graph.add_edge("create_purchase_orders", END)

        return graph

    def get_initial_state(self, **kwargs: Any) -> dict[str, Any]:
        """Build the initial state dict."""
        vendors = kwargs.get("vendors", [])
        if not vendors:
            vendors = DEFAULT_VENDORS

        return {
            "project_id": kwargs["project_id"],
            "bom_items": kwargs.get("bom_items", []),
            "vendors": vendors,
            "target_budget": kwargs.get("target_budget"),
            "currency": kwargs.get("currency", "INR"),
            "encrypted_key": kwargs.get("encrypted_key"),
            "iv": kwargs.get("iv"),
            "auth_tag": kwargs.get("auth_tag"),
            "plain_api_key": kwargs.get("plain_api_key"),
            "category_groups": {},
            "vendor_recommendations": {},
            "split_assignments": [],
            "purchase_orders": [],
            "total_order_value": 0.0,
            "total_shipping": 0.0,
            "error": None,
        }

    # -- Node implementations -----------------------------------------------

    async def _group_by_category(self, state: ProcurementState) -> dict[str, Any]:
        """Node 1: Group BOM items by material category."""
        logger.info(
            "procurement_group_items",
            project_id=state["project_id"],
            item_count=len(state["bom_items"]),
        )

        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in state["bom_items"]:
            category = item.get("category", "general")
            groups[category].append(item)

        logger.info(
            "procurement_grouped",
            categories=list(groups.keys()),
            group_sizes={k: len(v) for k, v in groups.items()},
        )

        return {"category_groups": dict(groups)}

    async def _select_vendors(self, state: ProcurementState) -> dict[str, Any]:
        """Node 2: Select vendors for each category using LLM reasoning."""
        logger.info("procurement_select_vendors", project_id=state["project_id"])

        groups = state["category_groups"]
        vendors = state["vendors"]

        # Build a summary for the LLM
        category_summaries = {}
        for cat, items in groups.items():
            total_value = sum(
                (item.get("unit_price") or 0) * item.get("quantity", 0)
                for item in items
            )
            category_summaries[cat] = {
                "item_count": len(items),
                "total_estimated_value": round(total_value, 2),
                "items": [
                    {"name": item.get("name"), "quantity": item.get("quantity"), "unit": item.get("unit")}
                    for item in items[:5]  # Limit to first 5 for prompt size
                ],
            }

        vendor_summaries = [
            {
                "id": v["id"],
                "name": v.get("name"),
                "category": v.get("category"),
                "city": v.get("city"),
                "lead_time_days": v.get("lead_time_days"),
                "minimum_order_value": v.get("minimum_order_value"),
                "rating": v.get("rating"),
                "tier": v.get("tier"),
            }
            for v in vendors
        ]

        prompt = f"""You are a procurement specialist for Indian residential interior design projects.

Given these material categories and available vendors, recommend the best vendor(s) for each category.

Categories:
{json.dumps(category_summaries, indent=2)}

Available Vendors:
{json.dumps(vendor_summaries, indent=2)}

Return a JSON object mapping each category to a ranked list of vendor IDs:
{{
    "category_name": ["best_vendor_id", "second_best_vendor_id"],
    ...
}}

Consider: category match, lead time, rating, minimum order requirements, and city proximity.
If a category has no matching vendor, assign the most versatile vendor.

Return ONLY the JSON object."""

        recommendations: dict[str, list[str]] = {}

        try:
            response = await self._llm.completion(
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                encrypted_key=state.get("encrypted_key"),
                iv=state.get("iv"),
                auth_tag=state.get("auth_tag"),
                plain_api_key=state.get("plain_api_key"),
                temperature=0.2,
                max_tokens=1500,
            )

            content = response.choices[0].message.content or "{}"
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
                content = content.strip()

            recommendations = json.loads(content)
            if not isinstance(recommendations, dict):
                recommendations = {}

        except Exception as exc:
            logger.warning("procurement_vendor_llm_failed", error=str(exc))

        # Fallback: match by category name
        if not recommendations:
            vendor_by_cat: dict[str, list[str]] = defaultdict(list)
            for v in vendors:
                v_cat = v.get("category", "")
                if isinstance(v_cat, list):
                    for c in v_cat:
                        vendor_by_cat[c].append(v["id"])
                else:
                    vendor_by_cat[v_cat].append(v["id"])

            for cat in groups:
                if cat in vendor_by_cat:
                    recommendations[cat] = vendor_by_cat[cat]
                else:
                    # Assign the first vendor as fallback
                    recommendations[cat] = [vendors[0]["id"]] if vendors else []

        return {"vendor_recommendations": recommendations}

    async def _optimise_split(self, state: ProcurementState) -> dict[str, Any]:
        """Node 3: Run OR-Tools multi-vendor optimisation."""
        logger.info("procurement_optimise_split", project_id=state["project_id"])

        bom_items = state["bom_items"]
        vendors = state["vendors"]

        # Run the optimiser
        result = optimise_vendor_split(bom_items, vendors)

        logger.info(
            "procurement_split_complete",
            solver_status=result.solver_status,
            vendors_used=result.vendors_used,
            total_cost=result.total_cost,
        )

        return {
            "split_assignments": result.assignments,
            "total_order_value": result.total_item_cost,
            "total_shipping": result.total_shipping_cost,
        }

    async def _create_purchase_orders(self, state: ProcurementState) -> dict[str, Any]:
        """Node 4: Assemble purchase orders from the optimised split."""
        logger.info("procurement_create_orders", project_id=state["project_id"])

        assignments = state["split_assignments"]
        vendors = state["vendors"]
        vendor_map = {v["id"]: v for v in vendors}
        now = datetime.now(tz=timezone.utc)

        # Group assignments by vendor
        vendor_items: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for assignment in assignments:
            vendor_id = assignment["vendor_id"]
            vendor_items[vendor_id].append(assignment)

        purchase_orders: list[dict[str, Any]] = []

        for vendor_id, items in vendor_items.items():
            vendor_data = vendor_map.get(vendor_id, {})
            order_id = str(uuid.uuid4())

            order_items: list[OrderItem] = []
            subtotal = 0.0

            for item in items:
                item_id = str(uuid.uuid4())
                line_total = item.get("line_total", 0)
                subtotal += line_total

                order_items.append(OrderItem(
                    id=item_id,
                    bom_item_id=item.get("item_id"),
                    category=item.get("item_category", ""),
                    name=item.get("item_name", ""),
                    specification="",
                    quantity=item.get("quantity", 0),
                    unit=item.get("unit", "nos"),
                    unit_price=item.get("unit_price", 0),
                    total_price=line_total,
                    currency=item.get("currency", "INR"),
                    vendor_id=vendor_id,
                    vendor_name=item.get("vendor_name", ""),
                ))

            shipping = vendor_data.get("shipping_cost_flat", 0)
            tax_rate = 0.18  # 18% GST default
            tax_amount = round(subtotal * tax_rate, 2)
            total_amount = round(subtotal + shipping + tax_amount, 2)

            # Determine expected delivery date
            lead_time = vendor_data.get("lead_time_days", 7)
            expected_delivery = date.today()
            from datetime import timedelta
            expected_delivery = date.today() + timedelta(days=lead_time)

            vendor_model = None
            if vendor_data:
                vendor_model = Vendor(
                    id=vendor_data.get("id", vendor_id),
                    name=vendor_data.get("name", "Unknown Vendor"),
                    category=vendor_data.get("category", "general"),
                    contact_email=vendor_data.get("contact_email"),
                    contact_phone=vendor_data.get("contact_phone"),
                    city=vendor_data.get("city"),
                    tier=VendorTier(vendor_data.get("tier", "standard")),
                    lead_time_days=lead_time,
                    minimum_order_value=vendor_data.get("minimum_order_value", 0),
                    minimum_order_quantity=vendor_data.get("minimum_order_quantity", 0),
                    shipping_cost_flat=shipping,
                    rating=vendor_data.get("rating", 3.0),
                )

            po = PurchaseOrder(
                id=order_id,
                project_id=state["project_id"],
                vendor=vendor_model,
                vendor_id=vendor_id,
                vendor_name=vendor_data.get("name", "Unknown"),
                status=OrderStatus.DRAFT,
                priority=OrderPriority.NORMAL,
                items=order_items,
                subtotal=round(subtotal, 2),
                shipping_cost=shipping,
                tax_amount=tax_amount,
                total_amount=total_amount,
                currency=state.get("currency", "INR"),
                order_date=date.today(),
                expected_delivery_date=expected_delivery,
                notes=f"Auto-generated PO for {vendor_data.get('name', vendor_id)}",
                created_at=now,
                updated_at=now,
            )

            purchase_orders.append(po.model_dump(mode="json"))

        logger.info(
            "procurement_orders_created",
            project_id=state["project_id"],
            order_count=len(purchase_orders),
        )

        return {"purchase_orders": purchase_orders}
