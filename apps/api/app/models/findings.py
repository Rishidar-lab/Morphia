"""Finding models — hypothesis-driven security findings and their verifications."""

from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.auth import generate_uuid


# Canonical severity values.
FINDING_SEVERITIES = {"critical", "high", "medium", "low", "info"}

# Canonical lifecycle states for Finding.state.
FINDING_STATES = {
    "candidate",
    "needs_evidence",
    "needs_reproduction",
    "verified",
    "rejected",
    "duplicate",
    "report_ready",
    "submitted",
    "triaged",
    "resolved",
}

# Canonical results for FindingVerification.result.
FINDING_VERIFICATION_RESULTS = {"confirmed", "denied", "inconclusive"}


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    observation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    hypothesis: Mapped[str] = mapped_column(Text, nullable=False, default="")

    verification_method: Mapped[str] = mapped_column(Text, nullable=False, default="")
    actual_result: Mapped[str] = mapped_column(Text, nullable=False, default="")
    expected_result: Mapped[str] = mapped_column(Text, nullable=False, default="")

    affected_scope: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    security_impact: Mapped[str] = mapped_column(Text, nullable=False, default="")
    uncertainty: Mapped[str] = mapped_column(Text, nullable=False, default="")

    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # critical, high, medium, low, info
    suggested_severity: Mapped[str | None] = mapped_column(String(20), nullable=True)  # unconfirmed, model-suggested

    cwe_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cvss_vector: Mapped[str | None] = mapped_column(String(200), nullable=True)

    remediation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    disclosure_status: Mapped[str] = mapped_column(String(50), nullable=False, default="internal")

    state: Mapped[str] = mapped_column(String(50), nullable=False, default="candidate")

    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    reviewer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    verifications: Mapped[list["FindingVerification"]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )


class FindingVerification(Base):
    __tablename__ = "finding_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    finding_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    verifier_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    method: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    result: Mapped[str] = mapped_column(String(50), nullable=False)  # confirmed, denied, inconclusive
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    evidence_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of evidence artifact IDs

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    finding: Mapped["Finding"] = relationship(back_populates="verifications")
