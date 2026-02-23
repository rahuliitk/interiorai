"""
Design generation orchestration service.

Manages the full lifecycle of a design generation job:

1. Create job record in the database.
2. Run the LangGraph design agent for each requested variant.
3. Store generated images in MinIO.
4. Update job progress, status, and output in the database.
5. Create ``design_variants`` rows for completed designs.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from openlintel_shared.config import Settings, get_settings
from openlintel_shared.db import _get_session_factory
from openlintel_shared.redis_client import publish
from openlintel_shared.storage import generate_presigned_url, upload_file

from src.agents.design_agent import DesignAgent
from src.models.requests import GenerateDesignRequest

logger = structlog.get_logger(__name__)


class GenerationService:
    """Orchestrates design generation jobs.

    Parameters
    ----------
    settings:
        Optional settings override.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._agent = DesignAgent()

    # ── Job management ────────────────────────────────────────────────────

    async def create_job(
        self,
        *,
        db: AsyncSession,
        user_id: str,
        room_id: str,
        input_data: dict[str, Any],
    ) -> str:
        """Create a pending job record in the database.

        Parameters
        ----------
        db:
            Active database session (will be committed by the caller's middleware).
        user_id:
            Authenticated user ID.
        room_id:
            Target room UUID.
        input_data:
            Serialisable dict of job input parameters.

        Returns
        -------
        str
            The new job's UUID.
        """
        job_id = str(uuid.uuid4())

        # Look up the project_id from the room
        project_row = await db.execute(
            text("SELECT project_id FROM rooms WHERE id = :room_id"),
            {"room_id": room_id},
        )
        project = project_row.mappings().first()
        project_id = project["project_id"] if project else None

        await db.execute(
            text("""
                INSERT INTO jobs (id, user_id, type, status, input_json, progress, project_id, room_id, created_at)
                VALUES (:id, :user_id, :type, :status, :input_json, :progress, :project_id, :room_id, :created_at)
            """),
            {
                "id": job_id,
                "user_id": user_id,
                "type": "design_generation",
                "status": "pending",
                "input_json": json.dumps(input_data),
                "progress": 0,
                "project_id": project_id,
                "room_id": room_id,
                "created_at": datetime.now(timezone.utc),
            },
        )

        logger.info("job_created", job_id=job_id, user_id=user_id, room_id=room_id)
        return job_id

    # ── Pipeline execution ────────────────────────────────────────────────

    async def run_pipeline(
        self,
        *,
        job_id: str,
        user_id: str,
        room_data: dict[str, Any],
        request: GenerateDesignRequest,
        api_key_material: dict[str, str],
        source_upload_key: str | None,
    ) -> None:
        """Run the full design generation pipeline as a background task.

        This method is designed to be called via ``BackgroundTasks.add_task``.
        It obtains its own database session (independent of the request session)
        and manages its own commit/rollback lifecycle.

        Parameters
        ----------
        job_id:
            The job UUID created by ``create_job``.
        user_id:
            Authenticated user ID.
        room_data:
            Room row data from the database.
        request:
            The original design generation request.
        api_key_material:
            ``{"encrypted_key": ..., "iv": ..., "auth_tag": ...}``
        source_upload_key:
            MinIO key for the source room photo (or ``None``).
        """
        factory = _get_session_factory(self._settings)

        try:
            # Mark job as running
            async with factory() as db:
                await self._update_job(
                    db,
                    job_id,
                    status="running",
                    progress=5,
                    output_updates={"current_step": "initializing"},
                    started_at=datetime.now(timezone.utc),
                )
                await db.commit()

            await self._publish_progress(job_id, 5, "initializing")

            design_ids: list[str] = []
            total_variants = request.num_variants
            progress_per_variant = 85 // total_variants  # Reserve 5% for init, 10% for finalize

            for variant_idx in range(total_variants):
                variant_base_progress = 5 + (variant_idx * progress_per_variant)
                current_step = f"generating_variant_{variant_idx + 1}_of_{total_variants}"

                async with factory() as db:
                    await self._update_job(
                        db,
                        job_id,
                        progress=variant_base_progress + 5,
                        output_updates={
                            "current_step": current_step,
                            "design_ids": design_ids,
                        },
                    )
                    await db.commit()

                await self._publish_progress(job_id, variant_base_progress + 5, current_step)

                try:
                    # Run the LangGraph agent for this variant
                    result = await self._agent.invoke(
                        room_data=room_data,
                        style=request.style.value,
                        budget_tier=request.budget_tier.value,
                        constraints=request.constraints,
                        source_upload_key=source_upload_key,
                        model=request.model,
                        encrypted_key=api_key_material["encrypted_key"],
                        iv=api_key_material["iv"],
                        auth_tag=api_key_material["auth_tag"],
                        variant_index=variant_idx,
                    )

                    # Store the design variant
                    design_id = await self._store_variant(
                        user_id=user_id,
                        job_id=job_id,
                        room_data=room_data,
                        request=request,
                        agent_result=result,
                        variant_index=variant_idx,
                    )

                    design_ids.append(design_id)

                    logger.info(
                        "variant_generated",
                        job_id=job_id,
                        variant_index=variant_idx,
                        design_id=design_id,
                        success=result.get("success", False),
                    )

                except Exception as exc:
                    logger.exception(
                        "variant_generation_failed",
                        job_id=job_id,
                        variant_index=variant_idx,
                    )
                    # Continue with remaining variants even if one fails
                    async with factory() as db:
                        await self._update_job(
                            db,
                            job_id,
                            output_updates={
                                "current_step": f"variant_{variant_idx + 1}_failed",
                                "design_ids": design_ids,
                                f"variant_{variant_idx}_error": str(exc),
                            },
                        )
                        await db.commit()

            # ── Finalize ──────────────────────────────────────────────────
            final_status = "completed" if design_ids else "failed"
            final_error = None if design_ids else "All variant generations failed"

            async with factory() as db:
                await self._update_job(
                    db,
                    job_id,
                    status=final_status,
                    progress=100,
                    output_updates={
                        "current_step": "completed",
                        "design_ids": design_ids,
                        "total_variants": len(design_ids),
                    },
                    completed_at=datetime.now(timezone.utc),
                    error=final_error,
                )
                await db.commit()

            await self._publish_progress(job_id, 100, "completed")

            logger.info(
                "pipeline_complete",
                job_id=job_id,
                design_count=len(design_ids),
                status=final_status,
            )

        except Exception as exc:
            logger.exception("pipeline_failed", job_id=job_id)
            try:
                async with factory() as db:
                    await self._update_job(
                        db,
                        job_id,
                        status="failed",
                        error=str(exc),
                        completed_at=datetime.now(timezone.utc),
                    )
                    await db.commit()
            except Exception:
                logger.exception("pipeline_failed_status_update_error", job_id=job_id)

            await self._publish_progress(job_id, -1, "failed")

    # ── Variant storage ───────────────────────────────────────────────────

    async def _store_variant(
        self,
        *,
        user_id: str,
        job_id: str,
        room_data: dict[str, Any],
        request: GenerateDesignRequest,
        agent_result: dict[str, Any],
        variant_index: int,
    ) -> str:
        """Store a generated design variant in the database and MinIO.

        Parameters
        ----------
        user_id:
            The user who requested the design.
        job_id:
            The parent job UUID.
        room_data:
            Room metadata from DB.
        request:
            The original request.
        agent_result:
            The final state from the LangGraph agent.
        variant_index:
            0-based index of this variant.

        Returns
        -------
        str
            The new design variant UUID.
        """
        design_id = str(uuid.uuid4())
        room_id = room_data.get("id", request.room_id)
        room_name = room_data.get("name", "Room")

        # Build the variant name
        style_label = request.style.value.replace("_", " ").title()
        variant_name = f"{room_name} — {style_label} #{variant_index + 1}"

        # Get the design spec and description from agent result
        description = agent_result.get("final_description", "")
        spec = agent_result.get("final_spec")
        prompt_used = agent_result.get("prompt", "")

        # Store design image in MinIO if available
        render_urls: list[str] = []
        image_data = agent_result.get("final_image_data")
        if image_data:
            storage_key = f"designs/{user_id}/{job_id}/{design_id}/render_0.png"
            try:
                import base64
                image_bytes = base64.b64decode(image_data)
                await asyncio.to_thread(
                    upload_file,
                    self._settings.MINIO_BUCKET,
                    storage_key,
                    image_bytes,
                    "image/png",
                    settings=self._settings,
                )
                presigned = await asyncio.to_thread(
                    generate_presigned_url,
                    self._settings.MINIO_BUCKET,
                    storage_key,
                    3600,
                    settings=self._settings,
                )
                render_urls.append(presigned)
            except Exception:
                logger.exception("design_image_storage_failed", design_id=design_id)

        # Build metadata
        metadata: dict[str, Any] = {
            "model_used": request.model,
            "iteration_count": agent_result.get("iteration_count", 0),
            "success": agent_result.get("success", False),
            "evaluation": agent_result.get("evaluation"),
        }

        # Store in the database
        factory = _get_session_factory(self._settings)
        async with factory() as db:
            await db.execute(
                text("""
                    INSERT INTO design_variants
                        (id, room_id, name, style, budget_tier, render_url,
                         render_urls, prompt_used, constraints, spec_json,
                         metadata, job_id, source_upload_id, created_at)
                    VALUES
                        (:id, :room_id, :name, :style, :budget_tier, :render_url,
                         :render_urls, :prompt_used, :constraints, :spec_json,
                         :metadata, :job_id, :source_upload_id, :created_at)
                """),
                {
                    "id": design_id,
                    "room_id": room_id,
                    "name": variant_name,
                    "style": request.style.value,
                    "budget_tier": request.budget_tier.value,
                    "render_url": render_urls[0] if render_urls else None,
                    "render_urls": json.dumps(render_urls),
                    "prompt_used": prompt_used[:5000] if prompt_used else None,  # Truncate long prompts
                    "constraints": json.dumps(request.constraints),
                    "spec_json": json.dumps(spec) if spec else None,
                    "metadata": json.dumps(metadata),
                    "job_id": job_id,
                    "source_upload_id": request.source_upload_id,
                    "created_at": datetime.now(timezone.utc),
                },
            )

            # Also link the design variant to the job
            await db.execute(
                text("""
                    UPDATE jobs SET design_variant_id = :design_id
                    WHERE id = :job_id AND design_variant_id IS NULL
                """),
                {"design_id": design_id, "job_id": job_id},
            )

            await db.commit()

        logger.info(
            "design_variant_stored",
            design_id=design_id,
            job_id=job_id,
            variant_name=variant_name,
        )

        return design_id

    # ── Job update helpers ────────────────────────────────────────────────

    @staticmethod
    async def _update_job(
        db: AsyncSession,
        job_id: str,
        *,
        status: str | None = None,
        progress: int | None = None,
        output_updates: dict[str, Any] | None = None,
        error: str | None = None,
        started_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> None:
        """Update a job record with new status, progress, and/or output data.

        Output updates are merged with existing ``output_json`` using
        PostgreSQL's ``||`` operator (JSONB merge).

        Parameters
        ----------
        db:
            Active database session.
        job_id:
            The job UUID.
        status:
            New status value (optional).
        progress:
            New progress percentage (optional).
        output_updates:
            Dict to merge into ``output_json`` (optional).
        error:
            Error message (optional).
        started_at:
            Timestamp when the job started running (optional).
        completed_at:
            Timestamp when the job finished (optional).
        """
        set_clauses: list[str] = []
        params: dict[str, Any] = {"job_id": job_id}

        if status is not None:
            set_clauses.append("status = :status")
            params["status"] = status

        if progress is not None:
            set_clauses.append("progress = :progress")
            params["progress"] = progress

        if output_updates is not None:
            set_clauses.append(
                "output_json = COALESCE(output_json, '{}'::jsonb) || :output_update::jsonb"
            )
            params["output_update"] = json.dumps(output_updates)

        if error is not None:
            set_clauses.append("error = :error")
            params["error"] = error

        if started_at is not None:
            set_clauses.append("started_at = :started_at")
            params["started_at"] = started_at

        if completed_at is not None:
            set_clauses.append("completed_at = :completed_at")
            params["completed_at"] = completed_at

        if not set_clauses:
            return

        query = f"UPDATE jobs SET {', '.join(set_clauses)} WHERE id = :job_id"
        await db.execute(text(query), params)

    async def _publish_progress(
        self,
        job_id: str,
        progress: int,
        step: str,
    ) -> None:
        """Publish a job progress update to Redis pub/sub.

        Clients can subscribe to the ``design:progress:{job_id}`` channel
        for real-time updates.

        Parameters
        ----------
        job_id:
            The job UUID.
        progress:
            Progress percentage (0-100, or -1 for failure).
        step:
            Human-readable step name.
        """
        try:
            await publish(
                f"design:progress:{job_id}",
                {
                    "job_id": job_id,
                    "progress": progress,
                    "step": step,
                },
            )
        except Exception:
            # Redis pub/sub failure should not break the pipeline
            logger.warning(
                "redis_publish_failed",
                job_id=job_id,
                progress=progress,
                step=step,
            )
