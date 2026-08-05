"""Report models — disclosure-ready reports assembled from findings and evidence."""

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


# Canonical lifecycle states for Report.status.
REPORT_STATUSES = {"draft", "review", "final", "submitted", "acknowledged"}

# Supported export/render formats.
REPORT_FORMATS = {"markdown", "html", "json"}


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(300), nullable=False)

    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    affected_asset: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    scope_confirmation: Mapped[str] = mapped_column(Text, nullable=False, default="")

    prerequisites: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reproduction_steps: Mapped[str] = mapped_column(Text, nullable=False, default="")

    expected_result: Mapped[str] = mapped_column(Text, nullable=False, default="")
    actual_result: Mapped[str] = mapped_column(Text, nullable=False, default="")

    impact: Mapped[str] = mapped_column(Text, nullable=False, default="")
    severity_rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")

    cwe_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cvss_vector: Mapped[str | None] = mapped_column(String(200), nullable=True)

    remediation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    limitations: Mapped[str] = mapped_column(Text, nullable=False, default="")

    disclosure_timeline: Mapped[list | None] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    format: Mapped[str] = mapped_column(String(50), nullable=False, default="markdown")

    creator_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    finding_links: Mapped[list["ReportFinding"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class ReportFinding(Base):
    """Junction table linking a Report to the Findings it presents."""

    __tablename__ = "report_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    report_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    finding_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("findings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    report: Mapped["Report"] = relationship(back_populates="finding_links")
