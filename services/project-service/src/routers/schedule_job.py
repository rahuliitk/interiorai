"""
Schedule job endpoint — accepts fire-and-forget calls from the tRPC
schedule.generate mutation, runs the ScheduleAgent, and persists results
to PostgreSQL (schedules + milestones tables) while updating the shared
jobs table.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import structlog
from fastapi import APIRouter, BackgroundTasks, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from openlintel_shared.config import get_settings
from openlintel_shared.db import get_session_factory
from openlintel_shared.job_worker import update_job_status

from src.agents.schedule_agent import ScheduleAgent

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/schedules", tags=["schedules"])


class ScheduleJobRequest(BaseModel):
    """Payload from tRPC schedule.generate fire-and-forget call."""

    job_id: str
    project_id: str
    user_id: str = ""


async def _run_schedule_job(request: ScheduleJobRequest) -> None:
    """Background task: fetch project data, run ScheduleAgent, persist results."""
    factory = get_session_factory()
    async with factory() as db:
        try:
            # Mark job as running
            await update_job_status(db, request.job_id, "running", progress=5)

            # Fetch project data from DB
            project_row = await db.execute(
                text("SELECT id, name FROM projects WHERE id = :pid"),
                {"pid": request.project_id},
            )
            project = project_row.mappings().first()
            if not project:
                await update_job_status(
                    db, request.job_id, "failed", error="Project not found"
                )
                return

            # Fetch rooms
            rooms_result = await db.execute(
                text(
                    "SELECT id, name, type, length_mm, width_mm, height_mm "
                    "FROM rooms WHERE project_id = :pid"
                ),
                {"pid": request.project_id},
            )
            rooms = [dict(r) for r in rooms_result.mappings().all()]

            if not rooms:
                await update_job_status(
                    db, request.job_id, "failed", error="No rooms found in project"
                )
                return

            await update_job_status(db, request.job_id, "running", progress=15)

            # Fetch BOM items (if any exist)
            bom_result = await db.execute(
                text(
                    "SELECT br.items, dv.room_id "
                    "FROM bom_results br "
                    "JOIN design_variants dv ON dv.id = br.design_variant_id "
                    "JOIN rooms r ON r.id = dv.room_id "
                    "WHERE r.project_id = :pid"
                ),
                {"pid": request.project_id},
            )
            bom_rows = bom_result.mappings().all()

            bom_items = []
            for row in bom_rows:
                items = row["items"] if isinstance(row["items"], list) else []
                for item in items:
                    bom_items.append(
                        {
                            "id": item.get("id", ""),
                            "room_id": row["room_id"],
                            "category": item.get("category", "general"),
                            "name": item.get("name", ""),
                            "quantity": item.get("quantity", 1),
                            "unit": item.get("unit", "piece"),
                        }
                    )

            # Fetch design variants
            dv_result = await db.execute(
                text(
                    "SELECT id, room_id, style, budget_tier, spec_json "
                    "FROM design_variants dv "
                    "JOIN rooms r ON r.id = dv.room_id "
                    "WHERE r.project_id = :pid"
                ),
                {"pid": request.project_id},
            )
            design_variants = [
                {
                    "id": dv["id"],
                    "room_id": dv["room_id"],
                    "style": dv["style"],
                    "budget_tier": dv["budget_tier"],
                    "spec_json": dv["spec_json"] or {},
                }
                for dv in dv_result.mappings().all()
            ]

            await update_job_status(db, request.job_id, "running", progress=25)

            # Run the schedule agent
            import uuid

            schedule_id = str(uuid.uuid4())
            room_inputs = [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "type": r["type"],
                    "dimensions": {
                        "length_mm": r.get("length_mm") or 0,
                        "width_mm": r.get("width_mm") or 0,
                        "height_mm": r.get("height_mm") or 2700,
                    },
                }
                for r in rooms
            ]

            agent = ScheduleAgent()
            result = await agent.invoke(
                schedule_id=schedule_id,
                project_id=request.project_id,
                project_name=project["name"],
                rooms=room_inputs,
                bom_items=bom_items,
                design_variants=design_variants,
                start_date=date.today().isoformat(),
                working_days_per_week=6,
            )

            await update_job_status(db, request.job_id, "running", progress=80)

            schedule_data = result.get("schedule_result", {})
            if not schedule_data:
                await update_job_status(
                    db,
                    request.job_id,
                    "failed",
                    error=result.get("error", "No schedule result produced"),
                )
                return

            # Persist schedule to PostgreSQL
            tasks_json = schedule_data.get("tasks", [])
            critical_path = schedule_data.get("critical_path_task_ids", [])
            start_date = schedule_data.get("start_date")
            end_date = schedule_data.get("end_date")

            now = datetime.now(timezone.utc)
            await db.execute(
                text(
                    "INSERT INTO schedules (id, project_id, job_id, tasks, critical_path, "
                    "start_date, end_date, metadata, created_at, updated_at) "
                    "VALUES (:id, :project_id, :job_id, :tasks, :critical_path, "
                    ":start_date, :end_date, :metadata, :created_at, :updated_at)"
                ),
                {
                    "id": schedule_id,
                    "project_id": request.project_id,
                    "job_id": request.job_id,
                    "tasks": __import__("json").dumps(tasks_json),
                    "critical_path": __import__("json").dumps(critical_path),
                    "start_date": start_date,
                    "end_date": end_date,
                    "metadata": __import__("json").dumps(
                        {
                            "total_duration_days": schedule_data.get(
                                "total_duration_days", 0
                            ),
                            "room_count": len(rooms),
                        }
                    ),
                    "created_at": now,
                    "updated_at": now,
                },
            )
            await db.commit()

            # Persist milestones
            milestones = schedule_data.get("milestones", [])
            for ms in milestones:
                ms_id = ms.get("id", str(uuid.uuid4()))
                await db.execute(
                    text(
                        "INSERT INTO milestones (id, schedule_id, name, description, "
                        "due_date, status, created_at) "
                        "VALUES (:id, :schedule_id, :name, :description, "
                        ":due_date, :status, :created_at)"
                    ),
                    {
                        "id": ms_id,
                        "schedule_id": schedule_id,
                        "name": ms.get("name", "Milestone"),
                        "description": ms.get("description", ""),
                        "due_date": ms.get("target_date"),
                        "status": "pending",
                        "created_at": now,
                    },
                )
            await db.commit()

            await update_job_status(
                db,
                request.job_id,
                "completed",
                progress=100,
                output_json={
                    "schedule_id": schedule_id,
                    "total_tasks": len(tasks_json),
                    "total_milestones": len(milestones),
                    "total_duration_days": schedule_data.get("total_duration_days", 0),
                },
            )

            logger.info(
                "schedule_job_complete",
                job_id=request.job_id,
                schedule_id=schedule_id,
                tasks=len(tasks_json),
                milestones=len(milestones),
            )

        except Exception as exc:
            logger.error(
                "schedule_job_failed",
                job_id=request.job_id,
                error=str(exc),
                exc_info=True,
            )
            try:
                await update_job_status(
                    db, request.job_id, "failed", error=str(exc)[:500]
                )
            except Exception:
                pass


@router.post(
    "/job",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Run schedule generation as a background job",
)
async def run_schedule_job(
    request: ScheduleJobRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """Accept a job from tRPC and run schedule generation in the background."""
    background_tasks.add_task(_run_schedule_job, request)
    return {"status": "accepted", "job_id": request.job_id}
