"""
Shared job-worker utilities consumed by all Python service ``/job`` endpoints.

Every helper takes an ``AsyncSession`` so it participates in the caller's
transaction.  SQL uses ``sqlalchemy.text`` with named parameters — no ORM
models needed (the Drizzle schema in TypeScript is the source of truth).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Job lifecycle helpers
# ---------------------------------------------------------------------------


async def update_job_status(
    db: AsyncSession,
    job_id: str,
    *,
    status: str,
    progress: int | None = None,
    output_json: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """Update a job row's status, progress, output, and timestamps."""
    sets: list[str] = ["status = :status"]
    params: dict[str, Any] = {"job_id": job_id, "status": status}

    if progress is not None:
        sets.append("progress = :progress")
        params["progress"] = progress

    if output_json is not None:
        sets.append("output_json = :output_json")
        params["output_json"] = json.dumps(output_json)

    if error is not None:
        sets.append("error = :error")
        params["error"] = error

    if status == "running":
        sets.append("started_at = :started_at")
        params["started_at"] = datetime.now(timezone.utc)
    elif status in ("completed", "failed"):
        sets.append("completed_at = :completed_at")
        params["completed_at"] = datetime.now(timezone.utc)

    sql = f"UPDATE jobs SET {', '.join(sets)} WHERE id = :job_id"  # noqa: S608
    await db.execute(text(sql), params)
    await db.commit()

    logger.info("job_status_updated", job_id=job_id, status=status, progress=progress)


# ---------------------------------------------------------------------------
# DB fetch helpers
# ---------------------------------------------------------------------------


async def get_design_variant(db: AsyncSession, variant_id: str) -> dict[str, Any] | None:
    """Fetch a design variant row as a dict."""
    row = await db.execute(
        text("""
            SELECT dv.id, dv.room_id, dv.name, dv.style, dv.budget_tier,
                   dv.spec_json, dv.render_url, dv.metadata,
                   r.project_id, r.type AS room_type, r.length_mm, r.width_mm, r.height_mm
            FROM design_variants dv
            JOIN rooms r ON dv.room_id = r.id
            WHERE dv.id = :variant_id
        """),
        {"variant_id": variant_id},
    )
    mapping = row.mappings().first()
    return dict(mapping) if mapping else None


async def get_user_api_key(
    db: AsyncSession,
    user_id: str,
    provider: str = "openai",
) -> dict[str, Any] | None:
    """Look up the user's most recent API key for a given provider."""
    row = await db.execute(
        text("""
            SELECT id, encrypted_key, iv, auth_tag
            FROM user_api_keys
            WHERE user_id = :user_id AND provider = :provider
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"user_id": user_id, "provider": provider},
    )
    mapping = row.mappings().first()
    return dict(mapping) if mapping else None


async def get_job(db: AsyncSession, job_id: str) -> dict[str, Any] | None:
    """Fetch a job row by ID."""
    row = await db.execute(
        text("SELECT * FROM jobs WHERE id = :job_id"),
        {"job_id": job_id},
    )
    mapping = row.mappings().first()
    return dict(mapping) if mapping else None


# ---------------------------------------------------------------------------
# Result persistence helpers
# ---------------------------------------------------------------------------


async def write_bom_result(
    db: AsyncSession,
    *,
    design_variant_id: str,
    job_id: str,
    items: list[dict[str, Any]],
    total_cost: float,
    currency: str = "INR",
    metadata: dict[str, Any] | None = None,
) -> str:
    """Insert a row into ``bom_results`` and return the new ID."""
    result_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO bom_results (id, design_variant_id, job_id, items, total_cost, currency, metadata)
            VALUES (:id, :design_variant_id, :job_id, :items, :total_cost, :currency, :metadata)
        """),
        {
            "id": result_id,
            "design_variant_id": design_variant_id,
            "job_id": job_id,
            "items": json.dumps(items),
            "total_cost": total_cost,
            "currency": currency,
            "metadata": json.dumps(metadata or {}),
        },
    )
    await db.commit()
    return result_id


async def write_drawing_result(
    db: AsyncSession,
    *,
    design_variant_id: str,
    job_id: str,
    drawing_type: str,
    dxf_storage_key: str | None = None,
    pdf_storage_key: str | None = None,
    svg_storage_key: str | None = None,
    ifc_storage_key: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Insert a row into ``drawing_results`` and return the new ID."""
    result_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO drawing_results
                (id, design_variant_id, job_id, drawing_type,
                 dxf_storage_key, pdf_storage_key, svg_storage_key,
                 ifc_storage_key, metadata)
            VALUES (:id, :design_variant_id, :job_id, :drawing_type,
                    :dxf_storage_key, :pdf_storage_key, :svg_storage_key,
                    :ifc_storage_key, :metadata)
        """),
        {
            "id": result_id,
            "design_variant_id": design_variant_id,
            "job_id": job_id,
            "drawing_type": drawing_type,
            "dxf_storage_key": dxf_storage_key,
            "pdf_storage_key": pdf_storage_key,
            "svg_storage_key": svg_storage_key,
            "ifc_storage_key": ifc_storage_key,
            "metadata": json.dumps(metadata or {}),
        },
    )
    await db.commit()
    return result_id


async def write_cutlist_result(
    db: AsyncSession,
    *,
    design_variant_id: str,
    job_id: str,
    panels: list[dict[str, Any]],
    hardware: list[dict[str, Any]] | None = None,
    nesting_result: dict[str, Any] | None = None,
    total_sheets: int = 0,
    waste_percent: float = 0.0,
) -> str:
    """Insert a row into ``cutlist_results`` and return the new ID."""
    result_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO cutlist_results
                (id, design_variant_id, job_id, panels, hardware, nesting_result,
                 total_sheets, waste_percent)
            VALUES (:id, :design_variant_id, :job_id, :panels, :hardware,
                    :nesting_result, :total_sheets, :waste_percent)
        """),
        {
            "id": result_id,
            "design_variant_id": design_variant_id,
            "job_id": job_id,
            "panels": json.dumps(panels),
            "hardware": json.dumps(hardware or []),
            "nesting_result": json.dumps(nesting_result or {}),
            "total_sheets": total_sheets,
            "waste_percent": waste_percent,
        },
    )
    await db.commit()
    return result_id


async def write_mep_result(
    db: AsyncSession,
    *,
    design_variant_id: str,
    job_id: str,
    calc_type: str,
    result: dict[str, Any],
    standards_cited: list[str] | None = None,
) -> str:
    """Insert a row into ``mep_calculations`` and return the new ID."""
    result_id = str(uuid.uuid4())
    await db.execute(
        text("""
            INSERT INTO mep_calculations
                (id, design_variant_id, job_id, calc_type, result, standards_cited)
            VALUES (:id, :design_variant_id, :job_id, :calc_type, :result, :standards_cited)
        """),
        {
            "id": result_id,
            "design_variant_id": design_variant_id,
            "job_id": job_id,
            "calc_type": calc_type,
            "result": json.dumps(result),
            "standards_cited": json.dumps(standards_cited or []),
        },
    )
    await db.commit()
    return result_id
