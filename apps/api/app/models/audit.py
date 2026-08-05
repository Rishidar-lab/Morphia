"""Audit log model — immutable record of security-relevant actions."""

from datetime import datetime

from sqlalchemy import DateTime, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.auth import generate_uuid


class AuditEventType:
    """Common audit event type constants (not exhaustive — freeform strings allowed)."""

    AUTH_LOGIN = "auth.login"
    AUTH_LOGOUT = "auth.logout"
    AUTH_FAILED = "auth.failed"
    PROJECT_CREATE = "project.create"
    PROJECT_DELETE = "project.delete"
    ENGAGEMENT_CREATE = "engagement.create"
    SCOPE_MODIFY = "scope.modify"
    RUN_TRANSITION = "run.transition"
    APPROVAL_DECIDE = "approval.decide"
    EVIDENCE_UPLOAD = "evidence.upload"
    FINDING_CREATE = "finding.create"
    REPORT_GENERATE = "report.generate"
    ROLE_CHANGE = "role.change"
    USER_SUSPEND = "user.suspend"


class AuditEvent(Base):
    """Append-only audit trail entry.

    Every security-relevant action in MORPHIA (auth, scope changes, run
    transitions, approvals, evidence handling, report generation, role
    changes) MUST write an AuditEvent. Rows are never updated or deleted
    by application code.
    """

    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    target_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(200), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
