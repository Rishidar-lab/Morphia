"""Run management routes with state-machine enforcement.

All state transitions go through `validate_transition` (the single
source of truth defined in app.models.runs) and every transition writes
a RunEvent for auditability.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditEvent, AuditEventType
from app.models.auth import User
from app.models.domain import Project
from app.models.runs import (
    TERMINAL_STATES,
    ApprovalRequest,
    Run,
    RunEvent,
    RunState,
    RunStep,
    validate_transition,
)
from app.routers.auth import get_current_user
from app.services.queue import enqueue_run_job

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────
class CreateRunRequest(BaseModel):
    title: str = Field(default="", max_length=300)
    agent_profile: str | None = Field(default=None, max_length=100)
    engagement_id: str | None = Field(default=None, max_length=36)
    plan: dict | None = None


class TransitionRequest(BaseModel):
    target_state: RunState
    reason: str = Field(default="", max_length=2000)


class DecisionRequest(BaseModel):
    justification: str = Field(default="", max_length=2000)


class RunResponse(BaseModel):
    id: str
    project_id: str
    engagement_id: str | None
    state: RunState
    title: str
    plan: dict | None
    agent_profile: str | None
    failure_reason: str
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RunEventResponse(BaseModel):
    id: str
    run_id: str
    event_type: str
    from_state: str | None
    to_state: str | None
    actor_id: str | None
    payload: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RunStepResponse(BaseModel):
    id: str
    run_id: str
    step_number: int
    action: str
    status: str
    input_data: dict | None
    output_data: dict | None
    error: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ──────────────────────────────────────────────
async def _get_owned_project(project_id: str, user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return project


async def _get_owned_run(run_id: str, user: User, db: AsyncSession) -> Run:
    result = await db.execute(select(Run).where(Run.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    project_result = await db.execute(select(Project).where(Project.id == run.project_id))
    project = project_result.scalar_one_or_none()
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return run


async def _record_event(
    db: AsyncSession,
    run: Run,
    event_type: str,
    from_state: RunState | None,
    to_state: RunState | None,
    actor_id: str | None,
    payload: dict | None = None,
) -> RunEvent:
    event = RunEvent(
        run_id=run.id,
        event_type=event_type,
        from_state=from_state.value if from_state else None,
        to_state=to_state.value if to_state else None,
        actor_id=actor_id,
        payload=payload,
    )
    db.add(event)
    await db.flush()
    await db.commit()
    return event


# ── Routes ───────────────────────────────────────────────
@router.post("/projects/{project_id}/runs", response_model=RunResponse, status_code=201)
async def create_run(
    project_id: str,
    body: CreateRunRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Run:
    """Create a new run in DRAFT state within a project. Verifies project ownership."""
    await _get_owned_project(project_id, user, db)

    run = Run(
        project_id=project_id,
        title=body.title,
        agent_profile=body.agent_profile,
        engagement_id=body.engagement_id,
        plan=body.plan,
        created_by=user.id,
        state=RunState.DRAFT,
    )
    db.add(run)
    await db.flush()
    await db.commit()

    await _record_event(
        db,
        run,
        event_type="run.created",
        from_state=None,
        to_state=RunState.DRAFT,
        actor_id=user.id,
    )

    await db.refresh(run)
    return run


@router.get("/runs", response_model=list[RunResponse])
async def list_runs(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Run]:
    """List runs across all projects owned by the current user."""
    result = await db.execute(
        select(Run)
        .join(Project, Project.id == Run.project_id)
        .where(Project.owner_id == user.id)
        .order_by(Run.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Run:
    """Get run details. Verifies ownership via the parent project."""
    return await _get_owned_run(run_id, user, db)


@router.post("/runs/{run_id}/transition", response_model=RunResponse)
async def transition_run(
    run_id: str,
    body: TransitionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Run:
    """Transition a run to a new state, enforcing the legal-transition table."""
    run = await _get_owned_run(run_id, user, db)

    current_state = RunState(run.state)
    target_state = body.target_state

    if not validate_transition(current_state, target_state):
        raise HTTPException(
            status_code=409,
            detail=f"Illegal transition from {current_state.value} to {target_state.value}.",
        )

    run.state = target_state
    if target_state == RunState.FAILED and body.reason:
        run.failure_reason = body.reason

    await db.flush()
    await db.commit()

    await _record_event(
        db,
        run,
        event_type="run.transition",
        from_state=current_state,
        to_state=target_state,
        actor_id=user.id,
        payload={"reason": body.reason} if body.reason else None,
    )

    await db.refresh(run)
    return run


@router.post("/runs/{run_id}/cancel", response_model=RunResponse)
async def cancel_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Run:
    """Cancel a run. Idempotent — cancelling an already-terminal run is a no-op."""
    run = await _get_owned_run(run_id, user, db)
    current_state = RunState(run.state)

    if current_state in TERMINAL_STATES:
        # Idempotent: already terminal. If already CANCELLED, just return as-is.
        return run

    if not validate_transition(current_state, RunState.CANCELLED):
        raise HTTPException(
            status_code=409,
            detail=f"Run cannot be cancelled from state {current_state.value}.",
        )

    run.state = RunState.CANCELLED
    await db.flush()
    await db.commit()

    await _record_event(
        db,
        run,
        event_type="run.cancelled",
        from_state=current_state,
        to_state=RunState.CANCELLED,
        actor_id=user.id,
    )

    await db.refresh(run)
    return run


@router.post("/runs/{run_id}/approve", response_model=RunResponse)
async def approve_run(
    run_id: str,
    body: DecisionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Run:
    """Approve a run currently awaiting plan or action approval.

    Separation of duties is limited by the single-owner MVP model (only the
    project owner can reach this endpoint, so a distinct approver cannot
    exist yet). As a compatible control, self-approval requires an explicit
    written justification and is permanently flagged as self-approved in the
    run timeline and audit trail.
    """
    run = await _get_owned_run(run_id, user, db)
    current_state = RunState(run.state)

    self_approval = run.created_by == user.id
    if self_approval and len(body.justification.strip()) < 10:
        raise HTTPException(
            status_code=422,
            detail="Self-approval requires a written justification (at least 10 characters).",
        )

    approval_type, next_state = _approval_target(current_state)
    if approval_type is None or next_state is None:
        raise HTTPException(
            status_code=409,
            detail=f"Run is not awaiting approval (state={current_state.value}).",
        )

    if not validate_transition(current_state, next_state):
        raise HTTPException(
            status_code=409,
            detail=f"Illegal transition from {current_state.value} to {next_state.value}.",
        )

    approval = ApprovalRequest(
        run_id=run.id,
        approval_type=approval_type,
        status="approved",
        requested_by=run.created_by,
        decided_by=user.id,
        justification=body.justification,
    )
    db.add(approval)

    run.state = next_state
    await db.flush()
    await db.commit()

    await _record_event(
        db,
        run,
        event_type="approval.decide",
        from_state=current_state,
        to_state=next_state,
        actor_id=user.id,
        payload={
            "decision": "approved",
            "justification": body.justification,
            "self_approved": run.created_by == user.id,
        },
    )
    db.add(
        AuditEvent(
            event_type=AuditEventType.APPROVAL_DECIDE,
            actor_id=user.id,
            target_type="run",
            target_id=run.id,
            action="approval.approved",
            metadata_json={
                "approval_type": approval_type,
                "to_state": next_state.value,
                "self_approved": run.created_by == user.id,
            },
        )
    )
    await db.flush()
    await db.commit()

    if next_state == RunState.QUEUED:
        await enqueue_run_job(run.id)

    await db.refresh(run)
    return run


@router.post("/runs/{run_id}/reject", response_model=RunResponse)
async def reject_run(
    run_id: str,
    body: DecisionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Run:
    """Reject a run currently awaiting plan or action approval. Moves it to CANCELLED.

    Self-decisions are flagged in the timeline and audit trail (see
    `approve_run` for why full blocking is not compatible with single-owner
    MVP); rejection additionally requires a written justification.
    """
    run = await _get_owned_run(run_id, user, db)
    current_state = RunState(run.state)

    if len(body.justification.strip()) < 10:
        raise HTTPException(
            status_code=422,
            detail="Rejecting a run requires a written justification (at least 10 characters).",
        )

    approval_type, _ = _approval_target(current_state)
    if approval_type is None:
        raise HTTPException(
            status_code=409,
            detail=f"Run is not awaiting approval (state={current_state.value}).",
        )

    if not validate_transition(current_state, RunState.CANCELLED):
        raise HTTPException(
            status_code=409,
            detail=f"Illegal transition from {current_state.value} to {RunState.CANCELLED.value}.",
        )

    approval = ApprovalRequest(
        run_id=run.id,
        approval_type=approval_type,
        status="rejected",
        requested_by=run.created_by,
        decided_by=user.id,
        justification=body.justification,
    )
    db.add(approval)

    run.state = RunState.CANCELLED
    await db.flush()
    await db.commit()

    await _record_event(
        db,
        run,
        event_type="approval.decide",
        from_state=current_state,
        to_state=RunState.CANCELLED,
        actor_id=user.id,
        payload={
            "decision": "rejected",
            "justification": body.justification,
            "self_approved": run.created_by == user.id,
        },
    )
    db.add(
        AuditEvent(
            event_type=AuditEventType.APPROVAL_DECIDE,
            actor_id=user.id,
            target_type="run",
            target_id=run.id,
            action="approval.rejected",
            metadata_json={
                "approval_type": approval_type,
                "self_approved": run.created_by == user.id,
            },
        )
    )
    await db.flush()

    await db.refresh(run)
    await db.commit()
    return run


@router.get("/runs/{run_id}/events", response_model=list[RunEventResponse])
async def list_run_events(
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RunEvent]:
    """List the audit trail of events for a run."""
    await _get_owned_run(run_id, user, db)

    result = await db.execute(
        select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/runs/{run_id}/steps", response_model=list[RunStepResponse])
async def list_run_steps(
    run_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RunStep]:
    """List the executed steps of a run, in order."""
    await _get_owned_run(run_id, user, db)

    result = await db.execute(
        select(RunStep).where(RunStep.run_id == run_id).order_by(RunStep.step_number.asc())
    )
    return list(result.scalars().all())


def _approval_target(current_state: RunState) -> tuple[str | None, RunState | None]:
    """Map an awaiting-approval state to its (approval_type, next_state_on_approve)."""
    if current_state == RunState.AWAITING_PLAN_APPROVAL:
        return "plan", RunState.QUEUED
    if current_state == RunState.AWAITING_ACTION_APPROVAL:
        return "action", RunState.RUNNING
    return None, None
