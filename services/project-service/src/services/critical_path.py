"""
Critical path calculation using OR-Tools.

Computes the longest (critical) path through a directed acyclic graph of
schedule tasks, identifying which tasks determine the minimum total project
duration and cannot be delayed without extending the end date.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import structlog
from ortools.sat.python import cp_model

logger = structlog.get_logger(__name__)


class CriticalPathResult:
    """Result of critical path analysis."""

    def __init__(
        self,
        critical_path_ids: list[str],
        total_duration: int,
        task_earliest_start: dict[str, int],
        task_latest_start: dict[str, int],
        task_float: dict[str, int],
    ) -> None:
        self.critical_path_ids = critical_path_ids
        self.total_duration = total_duration
        self.task_earliest_start = task_earliest_start
        self.task_latest_start = task_latest_start
        self.task_float = task_float


def compute_critical_path(
    tasks: list[dict[str, Any]],
    dependencies: list[dict[str, Any]],
) -> CriticalPathResult:
    """Compute the critical path through a task dependency graph.

    Uses OR-Tools CP-SAT solver to find the optimal (minimum makespan) schedule,
    then identifies zero-float tasks that form the critical path.

    Parameters
    ----------
    tasks:
        List of task dicts, each having at minimum ``id`` and ``duration_days``.
    dependencies:
        List of dependency dicts with ``from_task_id``, ``to_task_id``, and
        optional ``lag_days``.

    Returns
    -------
    CriticalPathResult
        Analysis result containing critical path IDs, total duration, earliest
        and latest starts, and float for each task.
    """
    if not tasks:
        return CriticalPathResult(
            critical_path_ids=[],
            total_duration=0,
            task_earliest_start={},
            task_latest_start={},
            task_float={},
        )

    task_map: dict[str, dict[str, Any]] = {t["id"]: t for t in tasks}
    task_ids = list(task_map.keys())

    # Build adjacency: successor list and predecessor list
    successors: dict[str, list[tuple[str, int]]] = defaultdict(list)
    predecessors: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for dep in dependencies:
        from_id = dep["from_task_id"]
        to_id = dep["to_task_id"]
        lag = dep.get("lag_days", 0)
        if from_id in task_map and to_id in task_map:
            successors[from_id].append((to_id, lag))
            predecessors[to_id].append((from_id, lag))

    # Maximum possible horizon (sum of all durations)
    horizon = sum(t.get("duration_days", 1) for t in tasks)

    model = cp_model.CpModel()

    # Decision variables: start time for each task
    start_vars: dict[str, cp_model.IntVar] = {}
    end_vars: dict[str, cp_model.IntVar] = {}
    for tid in task_ids:
        duration = task_map[tid].get("duration_days", 1)
        start_vars[tid] = model.new_int_var(0, horizon, f"start_{tid}")
        end_vars[tid] = model.new_int_var(0, horizon, f"end_{tid}")
        model.add(end_vars[tid] == start_vars[tid] + duration)

    # Precedence constraints
    for dep in dependencies:
        from_id = dep["from_task_id"]
        to_id = dep["to_task_id"]
        lag = dep.get("lag_days", 0)
        if from_id in task_map and to_id in task_map:
            # Successor cannot start until predecessor finishes + lag
            model.add(start_vars[to_id] >= end_vars[from_id] + lag)

    # Makespan variable: maximum of all end times
    makespan = model.new_int_var(0, horizon, "makespan")
    for tid in task_ids:
        model.add(makespan >= end_vars[tid])

    # Minimise makespan
    model.minimize(makespan)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    status = solver.solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        logger.warning(
            "critical_path_solver_failed",
            status=solver.status_name(status),
        )
        # Fallback: forward pass without solver
        return _fallback_critical_path(tasks, dependencies)

    total_duration = solver.value(makespan)

    # Extract earliest starts from the optimised schedule
    earliest_start: dict[str, int] = {}
    for tid in task_ids:
        earliest_start[tid] = solver.value(start_vars[tid])

    # Compute latest start via backward pass
    latest_start: dict[str, int] = {}
    for tid in task_ids:
        duration = task_map[tid].get("duration_days", 1)
        if not successors[tid]:
            # Terminal tasks: latest start = total_duration - duration
            latest_start[tid] = total_duration - duration
        else:
            latest_start[tid] = total_duration  # Will be refined below

    # Backward pass: topological reverse order
    topo_order = _topological_sort(task_ids, predecessors)
    for tid in reversed(topo_order):
        duration = task_map[tid].get("duration_days", 1)
        if successors[tid]:
            min_successor_ls = min(
                latest_start.get(succ_id, total_duration) - lag
                for succ_id, lag in successors[tid]
            )
            latest_start[tid] = min(latest_start[tid], min_successor_ls - duration)

    # Float = latest_start - earliest_start
    task_float: dict[str, int] = {}
    for tid in task_ids:
        task_float[tid] = max(0, latest_start[tid] - earliest_start[tid])

    # Critical path: tasks with zero float, in topological order
    critical_ids = [tid for tid in topo_order if task_float[tid] == 0]

    logger.info(
        "critical_path_computed",
        total_duration=total_duration,
        critical_task_count=len(critical_ids),
        solver_status=solver.status_name(status),
    )

    return CriticalPathResult(
        critical_path_ids=critical_ids,
        total_duration=total_duration,
        task_earliest_start=earliest_start,
        task_latest_start=latest_start,
        task_float=task_float,
    )


def _topological_sort(
    task_ids: list[str],
    predecessors: dict[str, list[tuple[str, int]]],
) -> list[str]:
    """Return a topological ordering of task IDs using Kahn's algorithm."""
    in_degree: dict[str, int] = {tid: 0 for tid in task_ids}
    adj: dict[str, list[str]] = defaultdict(list)

    for tid, preds in predecessors.items():
        for pred_id, _ in preds:
            if pred_id in in_degree and tid in in_degree:
                adj[pred_id].append(tid)
                in_degree[tid] += 1

    queue: list[str] = [tid for tid in task_ids if in_degree[tid] == 0]
    result: list[str] = []

    while queue:
        # Stable sort: pick the first available
        node = queue.pop(0)
        result.append(node)
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # If not all nodes are in result, there is a cycle; append remaining
    remaining = [tid for tid in task_ids if tid not in set(result)]
    result.extend(remaining)

    return result


def _fallback_critical_path(
    tasks: list[dict[str, Any]],
    dependencies: list[dict[str, Any]],
) -> CriticalPathResult:
    """Simple forward-pass critical path when OR-Tools solver fails.

    Uses the classic CPM forward/backward pass algorithm without the solver.
    """
    task_map: dict[str, dict[str, Any]] = {t["id"]: t for t in tasks}
    task_ids = list(task_map.keys())

    successors: dict[str, list[tuple[str, int]]] = defaultdict(list)
    predecessors: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for dep in dependencies:
        from_id = dep["from_task_id"]
        to_id = dep["to_task_id"]
        lag = dep.get("lag_days", 0)
        if from_id in task_map and to_id in task_map:
            successors[from_id].append((to_id, lag))
            predecessors[to_id].append((from_id, lag))

    topo = _topological_sort(task_ids, predecessors)

    # Forward pass: earliest start / earliest finish
    es: dict[str, int] = {}
    ef: dict[str, int] = {}
    for tid in topo:
        duration = task_map[tid].get("duration_days", 1)
        if not predecessors[tid]:
            es[tid] = 0
        else:
            es[tid] = max(
                ef.get(pred_id, 0) + lag
                for pred_id, lag in predecessors[tid]
            )
        ef[tid] = es[tid] + duration

    total_duration = max(ef.values()) if ef else 0

    # Backward pass: latest finish / latest start
    lf: dict[str, int] = {}
    ls: dict[str, int] = {}
    for tid in reversed(topo):
        duration = task_map[tid].get("duration_days", 1)
        if not successors[tid]:
            lf[tid] = total_duration
        else:
            lf[tid] = min(
                ls.get(succ_id, total_duration) - lag
                for succ_id, lag in successors[tid]
            )
        ls[tid] = lf[tid] - duration

    task_float: dict[str, int] = {}
    for tid in task_ids:
        task_float[tid] = max(0, ls.get(tid, 0) - es.get(tid, 0))

    critical_ids = [tid for tid in topo if task_float[tid] == 0]

    return CriticalPathResult(
        critical_path_ids=critical_ids,
        total_duration=total_duration,
        task_earliest_start=es,
        task_latest_start=ls,
        task_float=task_float,
    )
