"""
Multi-vendor order optimisation using OR-Tools.

Splits BOM items across available vendors to minimise total cost
(item cost + shipping) while respecting minimum order quantities (MOQ)
and minimum order values (MOV) per vendor.
"""

from __future__ import annotations

from typing import Any

import structlog
from ortools.linear_solver import pywraplp

logger = structlog.get_logger(__name__)


class SplitResult:
    """Result of the multi-vendor order splitting optimisation."""

    def __init__(
        self,
        assignments: list[dict[str, Any]],
        total_item_cost: float,
        total_shipping_cost: float,
        total_cost: float,
        solver_status: str,
        vendors_used: int,
    ) -> None:
        self.assignments = assignments
        self.total_item_cost = total_item_cost
        self.total_shipping_cost = total_shipping_cost
        self.total_cost = total_cost
        self.solver_status = solver_status
        self.vendors_used = vendors_used


def optimise_vendor_split(
    items: list[dict[str, Any]],
    vendors: list[dict[str, Any]],
) -> SplitResult:
    """Optimise the assignment of BOM items to vendors.

    Formulated as a mixed-integer linear program:
      - Decision variables: x[i][v] = quantity of item i assigned to vendor v
      - Binary variables: y[v] = 1 if any item is assigned to vendor v
      - Objective: minimise total item cost + shipping cost
      - Constraints:
        - All demand must be satisfied (sum over vendors == item quantity)
        - MOQ: if assigned, quantity >= MOQ
        - MOV: if vendor is used, total value >= MOV
        - Only assign items to vendors that carry that category

    Parameters
    ----------
    items:
        List of item dicts with ``id``, ``category``, ``quantity``, ``unit_price``.
    vendors:
        List of vendor dicts with ``id``, ``category``, ``minimum_order_quantity``,
        ``minimum_order_value``, ``shipping_cost_flat``, ``rating``.

    Returns
    -------
    SplitResult
        The optimised assignments and cost breakdown.
    """
    if not items or not vendors:
        return SplitResult(
            assignments=[],
            total_item_cost=0.0,
            total_shipping_cost=0.0,
            total_cost=0.0,
            solver_status="NO_DATA",
            vendors_used=0,
        )

    solver = pywraplp.Solver.CreateSolver("SCIP")
    if solver is None:
        logger.warning("or_tools_solver_unavailable", solver="SCIP")
        return _fallback_assignment(items, vendors)

    # Index mappings
    n_items = len(items)
    n_vendors = len(vendors)

    # Build category compatibility matrix: which vendors can supply which items
    vendor_categories: dict[int, set[str]] = {}
    for v_idx, vendor in enumerate(vendors):
        cats = vendor.get("category", "")
        if isinstance(cats, str):
            vendor_categories[v_idx] = {cats}
        elif isinstance(cats, list):
            vendor_categories[v_idx] = set(cats)
        else:
            vendor_categories[v_idx] = set()

    # Decision variables
    # x[i][v] = quantity of item i assigned to vendor v
    x: dict[tuple[int, int], pywraplp.Variable] = {}
    # y[v] = 1 if vendor v is used
    y: dict[int, pywraplp.Variable] = {}

    for v_idx in range(n_vendors):
        y[v_idx] = solver.IntVar(0, 1, f"y_{v_idx}")

    for i_idx, item in enumerate(items):
        item_qty = item.get("quantity", 0)
        item_cat = item.get("category", "")

        for v_idx, vendor in enumerate(vendors):
            # Only create variable if vendor supplies this category
            if item_cat in vendor_categories.get(v_idx, set()) or not vendor_categories.get(v_idx):
                x[(i_idx, v_idx)] = solver.NumVar(0.0, item_qty, f"x_{i_idx}_{v_idx}")
            else:
                x[(i_idx, v_idx)] = solver.NumVar(0.0, 0.0, f"x_{i_idx}_{v_idx}")

    # Constraint: all demand must be met
    for i_idx, item in enumerate(items):
        item_qty = item.get("quantity", 0)
        solver.Add(
            sum(x[(i_idx, v_idx)] for v_idx in range(n_vendors)) == item_qty,
            f"demand_{i_idx}",
        )

    # Constraint: link x and y (if any x > 0 for vendor, y must be 1)
    big_m = sum(item.get("quantity", 0) for item in items) + 1
    for v_idx in range(n_vendors):
        total_assigned = sum(x[(i_idx, v_idx)] for i_idx in range(n_items))
        solver.Add(total_assigned <= big_m * y[v_idx], f"link_y_{v_idx}")

    # Constraint: MOQ per item per vendor
    for v_idx, vendor in enumerate(vendors):
        moq = vendor.get("minimum_order_quantity", 0)
        if moq > 0:
            for i_idx in range(n_items):
                # Either x[i][v] >= moq or x[i][v] == 0
                # Use a binary helper: z[i][v] = 1 if x[i][v] > 0
                z = solver.IntVar(0, 1, f"z_{i_idx}_{v_idx}")
                item_qty = items[i_idx].get("quantity", 0)
                solver.Add(x[(i_idx, v_idx)] >= moq * z, f"moq_lb_{i_idx}_{v_idx}")
                solver.Add(x[(i_idx, v_idx)] <= item_qty * z, f"moq_ub_{i_idx}_{v_idx}")

    # Constraint: MOV per vendor
    for v_idx, vendor in enumerate(vendors):
        mov = vendor.get("minimum_order_value", 0)
        if mov > 0:
            vendor_total_value = sum(
                x[(i_idx, v_idx)] * (items[i_idx].get("unit_price", 0) or 0)
                for i_idx in range(n_items)
            )
            # If vendor is used, total value must be >= MOV
            solver.Add(
                vendor_total_value >= mov * y[v_idx],
                f"mov_{v_idx}",
            )

    # Objective: minimise total cost = item costs + shipping
    item_cost_expr = sum(
        x[(i_idx, v_idx)] * (items[i_idx].get("unit_price", 0) or 0)
        for i_idx in range(n_items)
        for v_idx in range(n_vendors)
    )
    shipping_cost_expr = sum(
        y[v_idx] * vendors[v_idx].get("shipping_cost_flat", 0)
        for v_idx in range(n_vendors)
    )

    # Add a small preference for higher-rated vendors (tie-breaking)
    rating_bonus = sum(
        x[(i_idx, v_idx)] * vendors[v_idx].get("rating", 3.0) * 0.01
        for i_idx in range(n_items)
        for v_idx in range(n_vendors)
    )

    solver.Minimize(item_cost_expr + shipping_cost_expr - rating_bonus)

    # Solve
    solver.set_time_limit(30000)  # 30 seconds
    status = solver.Solve()

    status_names = {
        pywraplp.Solver.OPTIMAL: "OPTIMAL",
        pywraplp.Solver.FEASIBLE: "FEASIBLE",
        pywraplp.Solver.INFEASIBLE: "INFEASIBLE",
        pywraplp.Solver.UNBOUNDED: "UNBOUNDED",
        pywraplp.Solver.NOT_SOLVED: "NOT_SOLVED",
    }
    solver_status = status_names.get(status, "UNKNOWN")

    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        logger.warning("vendor_split_solver_failed", status=solver_status)
        return _fallback_assignment(items, vendors)

    # Extract assignments
    assignments: list[dict[str, Any]] = []
    total_item_cost = 0.0
    total_shipping = 0.0
    vendors_used: set[int] = set()

    for i_idx, item in enumerate(items):
        for v_idx, vendor in enumerate(vendors):
            qty = x[(i_idx, v_idx)].solution_value()
            if qty > 0.001:  # Tolerance for floating point
                unit_price = item.get("unit_price", 0) or 0
                line_total = qty * unit_price
                total_item_cost += line_total
                vendors_used.add(v_idx)

                assignments.append({
                    "item_id": item["id"],
                    "item_name": item.get("name", ""),
                    "item_category": item.get("category", ""),
                    "vendor_id": vendor["id"],
                    "vendor_name": vendor.get("name", ""),
                    "quantity": round(qty, 2),
                    "unit": item.get("unit", "nos"),
                    "unit_price": unit_price,
                    "line_total": round(line_total, 2),
                    "currency": item.get("currency", "INR"),
                })

    for v_idx in vendors_used:
        total_shipping += vendors[v_idx].get("shipping_cost_flat", 0)

    logger.info(
        "vendor_split_complete",
        solver_status=solver_status,
        vendors_used=len(vendors_used),
        total_item_cost=round(total_item_cost, 2),
        total_shipping=round(total_shipping, 2),
    )

    return SplitResult(
        assignments=assignments,
        total_item_cost=round(total_item_cost, 2),
        total_shipping_cost=round(total_shipping, 2),
        total_cost=round(total_item_cost + total_shipping, 2),
        solver_status=solver_status,
        vendors_used=len(vendors_used),
    )


def _fallback_assignment(
    items: list[dict[str, Any]],
    vendors: list[dict[str, Any]],
) -> SplitResult:
    """Simple greedy assignment when the solver is unavailable or infeasible.

    Assigns each item to the cheapest compatible vendor, or the first vendor
    if no category match is found.
    """
    assignments: list[dict[str, Any]] = []
    total_item_cost = 0.0
    vendors_used: set[str] = set()

    # Build a category-to-vendor lookup, sorted by rating descending
    cat_vendors: dict[str, list[dict[str, Any]]] = {}
    for vendor in vendors:
        cat = vendor.get("category", "general")
        if isinstance(cat, list):
            for c in cat:
                cat_vendors.setdefault(c, []).append(vendor)
        else:
            cat_vendors.setdefault(cat, []).append(vendor)

    for cat in cat_vendors:
        cat_vendors[cat].sort(key=lambda v: -v.get("rating", 3.0))

    for item in items:
        item_cat = item.get("category", "")
        candidate_vendors = cat_vendors.get(item_cat, vendors[:1])
        if not candidate_vendors:
            candidate_vendors = vendors[:1]

        # Pick the highest-rated vendor
        chosen = candidate_vendors[0]
        qty = item.get("quantity", 0)
        unit_price = item.get("unit_price", 0) or 0
        line_total = qty * unit_price
        total_item_cost += line_total
        vendors_used.add(chosen["id"])

        assignments.append({
            "item_id": item["id"],
            "item_name": item.get("name", ""),
            "item_category": item_cat,
            "vendor_id": chosen["id"],
            "vendor_name": chosen.get("name", ""),
            "quantity": round(qty, 2),
            "unit": item.get("unit", "nos"),
            "unit_price": unit_price,
            "line_total": round(line_total, 2),
            "currency": item.get("currency", "INR"),
        })

    total_shipping = sum(
        v.get("shipping_cost_flat", 0)
        for v in vendors
        if v["id"] in vendors_used
    )

    return SplitResult(
        assignments=assignments,
        total_item_cost=round(total_item_cost, 2),
        total_shipping_cost=round(total_shipping, 2),
        total_cost=round(total_item_cost + total_shipping, 2),
        solver_status="FALLBACK",
        vendors_used=len(vendors_used),
    )
