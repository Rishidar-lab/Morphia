"""Evidence models — artifacts collected during engagements and their relations."""

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.auth import generate_uuid

# Canonical verification status values for EvidenceArtifact.verification_status.
EVIDENCE_VERIFICATION_STATUSES = {
    "unreviewed",
    "source_captured",
    "integrity_verified",
    "manually_reproduced",
    "contradicted",
    "inconclusive",
    "rejected",
}


class EvidenceArtifact(Base):
    __tablename__ = "evidence_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)

    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    engagement_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("engagements.id", ondelete="SET NULL"), nullable=True, index=True
    )
    run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    run_step_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("run_steps.id", ondelete="SET NULL"), nullable=True, index=True
    )

    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    source: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    acquisition_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False, default="")

    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256_digest: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    sensitivity: Mapped[str] = mapped_column(String(50), nullable=False, default="standard")

    verification_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="unreviewed"
    )

    reviewer_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    retention_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)

    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("evidence_artifacts.id", ondelete="SET NULL"), nullable=True
    )

    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    parent: Mapped["EvidenceArtifact | None"] = relationship(
        back_populates="children",
        remote_side=[id],  # noqa: A003
    )
    children: Mapped[list["EvidenceArtifact"]] = relationship(back_populates="parent")


class EvidenceRelation(Base):
    __tablename__ = "evidence_relations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    source_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evidence_artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evidence_artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relation_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # supplements, contradicts, supersedes
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
