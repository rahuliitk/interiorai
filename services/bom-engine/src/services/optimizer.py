"""
OR-Tools budget allocation optimizer.

Given a target budget and a list of priced BOM items, uses Google OR-Tools
to find the optimal allocation of spending across material categories,
potentially substituting materials to meet the budget constraint while
maximising quality.
"""

from __future__ import annotations

import math
from typing import Any

import structlog
from ortools.linear_solver import pywraplp

from openlintel_shared.schemas.design import BudgetTier

from src.agents.material_db import (
    MATERIAL_DATABASE,
    MaterialSpec,
    find_substitutes,
    get_price_for_tier,
)

logger = structlog.get_logger(__name__)

# Category priority weights: higher weight = less willingness to cut
CATEGORY_PRIORITY: dict[str, float] = {
    "electrical": 1.0,      # Safety critical, never compromise
    "plumbing": 1.0,        # Safety critical
    "civil": 0.95,          # Structural integrity
    "carpentry": 0.8,       # Core furniture
    "hardware": 0.75,       # Functional fittings
    "flooring": 0.7,        # High-visibility, important
    "painting": 0.6,        # Aesthetic but can be downgraded
    "false_ceiling": 0.5,   # Optional luxury
    "glass_aluminum": 0.5,
    "sanitaryware": 0.7,
    "appliances": 0.5,
    "soft_furnishing": 0.3,
    "decor": 0.2,           # Most flexible
}


def optimize_budget_allocation(
    items: list[dict[str, Any]],
    target_budget: float,
    budget_tier: BudgetTier,
) -> dict[str, Any]:
    """Run OR-Tools optimization to fit BOM items within a target budget.

    The optimizer uses a linear programming model that:
    1. Assigns each item a ``selected`` binary variable.
    2. For items with substitutes, adds alternative variables.
    3. Maximises a weighted quality score subject to the budget constraint.

    Parameters
    ----------
    items:
        Priced BOM items, each with ``unit_price``, ``quantity``, ``category``,
        ``waste_factor``, and ``material_key``.
    target_budget:
        Maximum budget in the project's currency.
    budget_tier:
        Current budget tier (used for substitute pricing).

    Returns
    -------
    dict[str, Any]
        Contains ``optimized_items``, ``original_total``, ``optimized_total``,
        ``savings``, ``savings_percent``, ``substitutions_applied``,
        and ``solver_status``.
    """
    logger.info(
        "budget_optimization_start",
        item_count=len(items),
        target_budget=target_budget,
    )

    # Calculate original total cost
    original_total = _calculate_total(items)

    # If already within budget, skip optimization
    if original_total <= target_budget:
        logger.info(
            "budget_within_target",
            original_total=original_total,
            target_budget=target_budget,
        )
        return {
            "optimized_items": items,
            "original_total": round(original_total, 2),
            "optimized_total": round(original_total, 2),
            "savings": 0.0,
            "savings_percent": 0.0,
            "substitutions_applied": [],
            "solver_status": "WITHIN_BUDGET",
        }

    # Build optimization problem
    solver = pywraplp.Solver.CreateSolver("GLOP")
    if solver is None:
        logger.error("or_tools_solver_unavailable")
        return {
            "optimized_items": items,
            "original_total": round(original_total, 2),
            "optimized_total": round(original_total, 2),
            "savings": 0.0,
            "savings_percent": 0.0,
            "substitutions_applied": [],
            "solver_status": "SOLVER_UNAVAILABLE",
        }

    # Build decision variables and constraints
    item_vars: list[dict[str, Any]] = []

    for idx, item in enumerate(items):
        material_key = item.get("material_key", "")
        category = item.get("category", "carpentry")
        priority = CATEGORY_PRIORITY.get(category, 0.5)
        quantity = float(item.get("quantity", 0))
        waste_factor = float(item.get("waste_factor", 0.05))
        unit_price = float(item.get("unit_price", 0) or 0)
        effective_qty = quantity * (1 + waste_factor)
        item_cost = effective_qty * unit_price

        # Variable: proportion of this item to include (0.0 to 1.0)
        # Safety-critical items get a minimum of 1.0
        min_proportion = 1.0 if priority >= 0.95 else 0.3
        var = solver.NumVar(min_proportion, 1.0, f"item_{idx}")

        # Find possible substitutes with lower cost
        alternatives: list[dict[str, Any]] = []
        if material_key and material_key in MATERIAL_DATABASE:
            for sub_spec in find_substitutes(material_key):
                sub_key = next(
                    (k for k, v in MATERIAL_DATABASE.items() if v is sub_spec),
                    None,
                )
                if sub_key is None:
                    continue

                sub_price = get_price_for_tier(sub_key, budget_tier)
                if sub_price is not None and sub_price < unit_price:
                    sub_cost = effective_qty * sub_price
                    # Variable for choosing the substitute
                    sub_var = solver.NumVar(0.0, 1.0, f"sub_{idx}_{sub_key}")
                    alternatives.append({
                        "var": sub_var,
                        "sub_key": sub_key,
                        "sub_spec": sub_spec,
                        "sub_price": sub_price,
                        "sub_cost": sub_cost,
                    })

        item_vars.append({
            "idx": idx,
            "item": item,
            "var": var,
            "cost": item_cost,
            "unit_price": unit_price,
            "effective_qty": effective_qty,
            "priority": priority,
            "alternatives": alternatives,
        })

    # Constraint: exactly one choice per item (original or one substitute)
    for iv in item_vars:
        if iv["alternatives"]:
            constraint = solver.Constraint(1.0, 1.0, f"one_choice_{iv['idx']}")
            constraint.SetCoefficient(iv["var"], 1.0)
            for alt in iv["alternatives"]:
                constraint.SetCoefficient(alt["var"], 1.0)

    # Budget constraint
    budget_constraint = solver.Constraint(0.0, target_budget, "budget")
    for iv in item_vars:
        budget_constraint.SetCoefficient(iv["var"], iv["cost"])
        for alt in iv["alternatives"]:
            budget_constraint.SetCoefficient(alt["var"], alt["sub_cost"])

    # Objective: maximise weighted quality score
    objective = solver.Objective()
    objective.SetMaximization()
    for iv in item_vars:
        # Higher priority * higher proportion = better
        objective.SetCoefficient(iv["var"], iv["priority"] * 100)
        for alt in iv["alternatives"]:
            # Substitutes get slightly lower quality score
            objective.SetCoefficient(alt["var"], iv["priority"] * 80)

    # Solve
    status = solver.Solve()
    status_map = {
        pywraplp.Solver.OPTIMAL: "OPTIMAL",
        pywraplp.Solver.FEASIBLE: "FEASIBLE",
        pywraplp.Solver.INFEASIBLE: "INFEASIBLE",
        pywraplp.Solver.UNBOUNDED: "UNBOUNDED",
        pywraplp.Solver.ABNORMAL: "ABNORMAL",
        pywraplp.Solver.NOT_SOLVED: "NOT_SOLVED",
    }
    solver_status = status_map.get(status, "UNKNOWN")

    logger.info("budget_optimization_solved", status=solver_status)

    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        # Solver could not find a solution; return items as-is
        return {
            "optimized_items": items,
            "original_total": round(original_total, 2),
            "optimized_total": round(original_total, 2),
            "savings": 0.0,
            "savings_percent": 0.0,
            "substitutions_applied": [],
            "solver_status": solver_status,
        }

    # Extract results
    optimized_items: list[dict[str, Any]] = []
    substitutions_applied: list[dict[str, Any]] = []
    optimized_total = 0.0

    for iv in item_vars:
        original_selected = iv["var"].solution_value()
        best_alt = None
        best_alt_val = 0.0

        for alt in iv["alternatives"]:
            val = alt["var"].solution_value()
            if val > best_alt_val:
                best_alt_val = val
                best_alt = alt

        if best_alt is not None and best_alt_val > 0.5:
            # Substitute selected
            sub_spec: MaterialSpec = best_alt["sub_spec"]
            new_item = {**iv["item"]}
            new_item["material_key"] = best_alt["sub_key"]
            new_item["name"] = sub_spec.name
            new_item["specification"] = sub_spec.description
            new_item["unit_price"] = best_alt["sub_price"]
            optimized_items.append(new_item)

            item_cost = iv["effective_qty"] * best_alt["sub_price"]
            optimized_total += item_cost

            original_name = iv["item"].get("name", "")
            cost_impact = 0.0
            if iv["unit_price"] > 0:
                cost_impact = (
                    (best_alt["sub_price"] - iv["unit_price"]) / iv["unit_price"]
                ) * 100

            substitutions_applied.append({
                "original_material": original_name,
                "substitute_material": sub_spec.name,
                "reason": "budget",
                "cost_impact_percent": round(cost_impact, 1),
                "quality_impact": sub_spec.description,
                "recommendation": (
                    f"Substituted {original_name} with {sub_spec.name} "
                    f"to meet budget target (saves {abs(cost_impact):.0f}%)."
                ),
            })
        else:
            # Keep original (possibly scaled)
            proportion = max(original_selected, 0.3)
            new_item = {**iv["item"]}
            if proportion < 0.99:
                # Reduce quantity proportionally
                new_qty = float(new_item.get("quantity", 0)) * proportion
                new_item["quantity"] = round(new_qty, 1)

            optimized_items.append(new_item)
            item_cost = (
                float(new_item.get("quantity", 0))
                * (1 + float(new_item.get("waste_factor", 0)))
                * float(new_item.get("unit_price", 0) or 0)
            )
            optimized_total += item_cost

    savings = original_total - optimized_total
    savings_pct = (savings / original_total * 100) if original_total > 0 else 0.0

    logger.info(
        "budget_optimization_complete",
        original_total=round(original_total, 2),
        optimized_total=round(optimized_total, 2),
        savings=round(savings, 2),
        substitutions=len(substitutions_applied),
    )

    return {
        "optimized_items": optimized_items,
        "original_total": round(original_total, 2),
        "optimized_total": round(optimized_total, 2),
        "savings": round(max(savings, 0), 2),
        "savings_percent": round(max(savings_pct, 0), 1),
        "substitutions_applied": substitutions_applied,
        "solver_status": solver_status,
    }


def _calculate_total(items: list[dict[str, Any]]) -> float:
    """Calculate the total cost of a list of items."""
    total = 0.0
    for item in items:
        quantity = float(item.get("quantity", 0))
        waste_factor = float(item.get("waste_factor", 0))
        unit_price = float(item.get("unit_price", 0) or 0)
        total += quantity * (1 + waste_factor) * unit_price
    return total
