"""Run orchestration models with canonical state machine."""

import enum
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.auth import generate_uuid


class RunState(enum.StrEnum):
    """Canonical run states — shared between backend and frontend.

    This is the SINGLE SOURCE OF TRUTH for run states.
    The frontend must derive its state types from this enum.
    """

    DRAFT = "DRAFT"
    PLANNING = "PLANNING"
    AWAITING_PLAN_APPROVAL = "AWAITING_PLAN_APPROVAL"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    AWAITING_ACTION_APPROVAL = "AWAITING_ACTION_APPROVAL"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# ── Legal State Transitions ──────────────────────────────
# Defines which transitions are allowed. Any transition not
# listed here MUST be rejected server-side.
LEGAL_TRANSITIONS: dict[RunState, set[RunState]] = {
    RunState.DRAFT: {RunState.PLANNING, RunState.CANCELLED},
    RunState.PLANNING: {RunState.AWAITING_PLAN_APPROVAL, RunState.FAILED, RunState.CANCELLED},
    RunState.AWAITING_PLAN_APPROVAL: {RunState.QUEUED, RunState.CANCELLED},
    RunState.QUEUED: {RunState.RUNNING, RunState.FAILED, RunState.CANCELLED},
    RunState.RUNNING: {
        RunState.AWAITING_ACTION_APPROVAL,
        RunState.PAUSED,
        RunState.COMPLETED,
        RunState.FAILED,
        RunState.CANCELLED,
    },
    RunState.AWAITING_ACTION_APPROVAL: {RunState.RUNNING, RunState.CANCELLED},
    RunState.PAUSED: {RunState.QUEUED, RunState.CANCELLED},
    RunState.COMPLETED: set(),
    RunState.FAILED: {RunState.DRAFT},  # allow retry from failed
    RunState.CANCELLED: set(),
}

# States where cancel is valid
CANCELLABLE_STATES = {
    RunState.DRAFT,
    RunState.PLANNING,
    RunState.AWAITING_PLAN_APPROVAL,
    RunState.QUEUED,
    RunState.RUNNING,
    RunState.AWAITING_ACTION_APPROVAL,
    RunState.PAUSED,
}

# States where approval controls should appear
APPROVAL_STATES = {RunState.AWAITING_PLAN_APPROVAL, RunState.AWAITING_ACTION_APPROVAL}

# Terminal states
TERMINAL_STATES = {RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED}


def validate_transition(current: RunState, target: RunState) -> bool:
    """Validate that a state transition is legal."""
    return target in LEGAL_TRANSITIONS.get(current, set())


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    state: Mapped[RunState] = mapped_column(
        Enum(RunState, native_enum=False), nullable=False, default=RunState.DRAFT
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    # Which engagement's scope this run executes against. Required before a run can
    # leave DRAFT/PLANNING for QUEUED — the worker's scope re-check (architecture.md §7)
    # has nothing to validate against without it.
    engagement_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("engagements.id"), nullable=True, index=True
    )
    plan: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    agent_profile: Mapped[str] = mapped_column(String(100), nullable=True)
    model_config_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    failure_reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    steps: Mapped[list["RunStep"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    events: Mapped[list["RunEvent"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class RunStep(Base):
    __tablename__ = "run_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    input_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str] = mapped_column(Text, nullable=False, default="")
    idempotency_key: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    run: Mapped["Run"] = relationship(back_populates="steps")


class RunEvent(Base):
    __tablename__ = "run_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    from_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    run: Mapped["Run"] = relationship(back_populates="events")


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approval_type: Mapped[str] = mapped_column(String(50), nullable=False)  # plan, action
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )  # pending, approved, rejected
    requested_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    decided_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    justification: Mapped[str] = mapped_column(Text, nullable=False, default="")
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
