"""Worker-callback routes.

Authenticated with `WORKER_AUTH_SECRET` via the `X-Worker-Auth` header —
a distinct mechanism from user sessions, never issued to browser clients
(docs/security.md §5, §1.10). This is the *only* surface the worker
process talks to: it has no direct database access, so every fact it
needs about a run (and every scope decision) is mediated here.

Scope is re-validated independently at claim time for every step, even
though the API already validated it once when the run was approved into
QUEUED (docs/architecture.md §7) — a job can sit in Redis for a while and
scope/engagement state can change underneath it.
"""

import hmac

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.models.runs import (
    TERMINAL_STATES,
    Run,
    RunEvent,
    RunState,
    RunStep,
    validate_transition,
)
from app.services.scope_validator import ScopeValidator

logger = structlog.get_logger()
settings = get_settings()
router = APIRouter()

WORKER_AUTH_HEADER = "X-Worker-Auth"


def require_worker_auth(request: Request) -> str:
    """Validate the shared worker secret. Returns the raw secret for logging context."""
    provided = request.headers.get(WORKER_AUTH_HEADER, "")
    expected = settings.worker_auth_secret
    if not expected or not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing worker credentials.")
    return provided


# ── Schemas ──────────────────────────────────────────────
class ClaimRequest(BaseModel):
    worker_id: str = Field(max_length=100)


class ClaimResponse(BaseModel):
    run_id: str
    done: bool
    engagement_id: str | None = None
    step_number: int | None = None
    action: str | None = None
    target: str | None = None
    prompt: str | None = None
    agent_profile: str | None = None
    tool: str | None = None


class SubmitStepRequest(BaseModel):
    worker_id: str = Field(max_length=100)
    step_number: int
    action: str = Field(max_length=200)
    status: str = Field(max_length=50)
    input_data: dict | None = None
    output_data: dict | None = None
    error: str = ""
    idempotency_key: str = Field(max_length=100)


class WorkerTransitionRequest(BaseModel):
    worker_id: str = Field(max_length=100)
    target_state: RunState
    reason: str = Field(default="", max_length=2000)


# ── Helpers ──────────────────────────────────────────────
async def _get_run(run_id: str, db: AsyncSession) -> Run:
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


async def _record_event(
    db: AsyncSession,
    run: Run,
    event_type: str,
    from_state: RunState | None,
    to_state: RunState | None,
    worker_id: str,
    payload: dict | None = None,
) -> None:
    event = RunEvent(
        run_id=run.id,
        event_type=event_type,
        from_state=from_state.value if from_state else None,
        to_state=to_state.value if to_state else None,
        actor_id=f"worker:{worker_id}",
        payload=payload,
    )
    db.add(event)
    await db.flush()


# ── Routes ───────────────────────────────────────────────
@router.post("/runs/{run_id}/claim", response_model=ClaimResponse)
@limiter.limit(settings.worker_auth_rate_limit)
async def claim_run(
    request: Request,
    run_id: str,
    body: ClaimRequest,
    _auth: str = Depends(require_worker_auth),
    db: AsyncSession = Depends(get_db),
) -> ClaimResponse:
    """Claim the next unexecuted step of a run, re-validating scope for it.

    First call on a QUEUED run also transitions it to RUNNING. Subsequent
    calls advance through `run.plan["steps"]` in order. Returns
    `done=True` once every step has a recorded RunStep — the worker
    should then transition the run to COMPLETED.
    """
    run = await _get_run(run_id, db)

    if run.state == RunState.QUEUED:
        if not validate_transition(RunState.QUEUED, RunState.RUNNING):
            raise HTTPException(
                status_code=409, detail="QUEUED -> RUNNING is not a legal transition."
            )
        current = RunState.QUEUED
        run.state = RunState.RUNNING
        await db.flush()
        await _record_event(db, run, "run.claimed", current, RunState.RUNNING, body.worker_id)
    elif run.state != RunState.RUNNING:
        raise HTTPException(
            status_code=409, detail=f"Run is not claimable in state {run.state.value}."
        )

    if run.engagement_id is None:
        run.state = RunState.FAILED
        run.failure_reason = "No engagement_id set on run; cannot validate scope."
        await db.flush()
        await _record_event(
            db, run, "run.failed", RunState.RUNNING, RunState.FAILED, body.worker_id
        )
        # get_db() rolls back on any exception leaving this handler, which would
        # otherwise silently undo the FAILED transition we just wrote — commit
        # it explicitly before raising so the failure is durable, not lost.
        await db.commit()
        raise HTTPException(status_code=400, detail="Run has no engagement_id; cannot execute.")

    steps_result = await db.execute(select(RunStep).where(RunStep.run_id == run.id))
    completed_count = len(steps_result.scalars().all())

    plan_steps = (run.plan or {}).get("steps", [])
    if completed_count >= len(plan_steps):
        return ClaimResponse(run_id=run.id, done=True)

    step_def = plan_steps[completed_count]
    target = str(step_def.get("target", ""))
    action = str(step_def.get("action", ""))
    tool_raw = step_def.get("tool")
    tool = str(tool_raw) if tool_raw else None
    step_number = completed_count + 1

    scope_result = await ScopeValidator(db).validate_target(
        engagement_id=run.engagement_id,
        target=target,
        action=action,
        actor=f"worker:{body.worker_id}",
        actor_role="worker_service",
    )

    if not scope_result.allowed:
        run.state = RunState.FAILED
        run.failure_reason = f"Scope denied at step {step_number}: {scope_result.reason}"
        await db.flush()
        await _record_event(
            db,
            run,
            "run.scope_denied",
            RunState.RUNNING,
            RunState.FAILED,
            body.worker_id,
            payload={
                "step_number": step_number,
                "target": target,
                "action": action,
                "reason": scope_result.reason,
            },
        )
        # Same rollback-on-exception hazard as above: commit the FAILED
        # transition before raising, or get_db() discards it.
        await db.commit()
        raise HTTPException(status_code=403, detail=scope_result.reason)

    await _record_event(
        db,
        run,
        "run.step_claimed",
        None,
        None,
        body.worker_id,
        payload={"step_number": step_number, "target": target, "action": action, "tool": tool},
    )

    return ClaimResponse(
        run_id=run.id,
        done=False,
        engagement_id=run.engagement_id,
        step_number=step_number,
        action=action,
        target=target,
        prompt=str(step_def.get("prompt", "")),
        agent_profile=run.agent_profile,
        tool=tool,
    )


@router.post("/runs/{run_id}/steps", status_code=201)
@limiter.limit(settings.worker_auth_rate_limit)
async def submit_step(
    request: Request,
    run_id: str,
    body: SubmitStepRequest,
    _auth: str = Depends(require_worker_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Record the result of an executed step. Idempotent on `idempotency_key`."""
    run = await _get_run(run_id, db)

    existing = await db.execute(
        select(RunStep).where(RunStep.idempotency_key == body.idempotency_key)
    )
    existing_step = existing.scalar_one_or_none()
    if existing_step is not None:
        logger.info(
            "worker.step_already_recorded", run_id=run_id, idempotency_key=body.idempotency_key
        )
        return {"id": existing_step.id, "already_recorded": True}

    step = RunStep(
        run_id=run.id,
        step_number=body.step_number,
        action=body.action,
        status=body.status,
        input_data=body.input_data,
        output_data=body.output_data,
        error=body.error,
        idempotency_key=body.idempotency_key,
    )
    db.add(step)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = await db.execute(
            select(RunStep).where(RunStep.idempotency_key == body.idempotency_key)
        )
        existing_step = existing.scalar_one_or_none()
        if existing_step is not None:
            return {"id": existing_step.id, "already_recorded": True}
        raise

    await _record_event(
        db,
        run,
        "run.step_completed",
        None,
        None,
        body.worker_id,
        payload={"step_number": body.step_number, "status": body.status},
    )

    return {"id": step.id, "already_recorded": False}


@router.post("/runs/{run_id}/transition")
@limiter.limit(settings.worker_auth_rate_limit)
async def worker_transition_run(
    request: Request,
    run_id: str,
    body: WorkerTransitionRequest,
    _auth: str = Depends(require_worker_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Transition a run's state as the worker (e.g. RUNNING -> COMPLETED/FAILED)."""
    run = await _get_run(run_id, db)
    current_state = RunState(run.state)

    if current_state in TERMINAL_STATES:
        raise HTTPException(
            status_code=409, detail=f"Run is already terminal ({current_state.value})."
        )

    if not validate_transition(current_state, body.target_state):
        raise HTTPException(
            status_code=409,
            detail=f"Illegal transition from {current_state.value} to {body.target_state.value}.",
        )

    run.state = body.target_state
    if body.target_state == RunState.FAILED and body.reason:
        run.failure_reason = body.reason
    await db.flush()

    await _record_event(
        db,
        run,
        "run.transition",
        current_state,
        body.target_state,
        body.worker_id,
        payload={"reason": body.reason} if body.reason else None,
    )

    return {"id": run.id, "state": run.state.value}
