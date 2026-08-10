"""Report routes — assembling, editing, and exporting disclosure-ready reports."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditEvent, AuditEventType
from app.models.auth import User
from app.models.domain import Project
from app.models.evidence import EvidenceArtifact
from app.models.findings import Finding
from app.models.reports import REPORT_FORMATS, REPORT_STATUSES, Report, ReportFinding
from app.routers.auth import get_current_user
from app.services.report_generator import ReportGenerator

router = APIRouter()
_generator = ReportGenerator()


# ── Schemas ──────────────────────────────────────────────
class CreateReportRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(default="", max_length=8000)
    affected_asset: str = Field(default="", max_length=500)
    scope_confirmation: str = Field(default="", max_length=8000)
    prerequisites: str = Field(default="", max_length=8000)
    reproduction_steps: str = Field(default="", max_length=8000)
    expected_result: str = Field(default="", max_length=8000)
    actual_result: str = Field(default="", max_length=8000)
    impact: str = Field(default="", max_length=8000)
    severity_rationale: str = Field(default="", max_length=8000)
    cwe_id: str | None = Field(default=None, max_length=20)
    cvss_vector: str | None = Field(default=None, max_length=200)
    remediation: str = Field(default="", max_length=8000)
    limitations: str = Field(default="", max_length=8000)
    disclosure_timeline: list[dict] | None = None
    format: str = Field(default="markdown", max_length=50)

    @field_validator("format")
    @classmethod
    def _validate_format(cls, value: str) -> str:
        if value not in REPORT_FORMATS:
            raise ValueError(f"format must be one of: {sorted(REPORT_FORMATS)}")
        return value


class UpdateReportRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    summary: str | None = Field(default=None, max_length=8000)
    affected_asset: str | None = Field(default=None, max_length=500)
    scope_confirmation: str | None = Field(default=None, max_length=8000)
    prerequisites: str | None = Field(default=None, max_length=8000)
    reproduction_steps: str | None = Field(default=None, max_length=8000)
    expected_result: str | None = Field(default=None, max_length=8000)
    actual_result: str | None = Field(default=None, max_length=8000)
    impact: str | None = Field(default=None, max_length=8000)
    severity_rationale: str | None = Field(default=None, max_length=8000)
    cwe_id: str | None = Field(default=None, max_length=20)
    cvss_vector: str | None = Field(default=None, max_length=200)
    remediation: str | None = Field(default=None, max_length=8000)
    limitations: str | None = Field(default=None, max_length=8000)
    disclosure_timeline: list[dict] | None = None
    status: str | None = Field(default=None, max_length=50)
    format: str | None = Field(default=None, max_length=50)

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in REPORT_STATUSES:
            raise ValueError(f"status must be one of: {sorted(REPORT_STATUSES)}")
        return value

    @field_validator("format")
    @classmethod
    def _validate_format(cls, value: str | None) -> str | None:
        if value is not None and value not in REPORT_FORMATS:
            raise ValueError(f"format must be one of: {sorted(REPORT_FORMATS)}")
        return value


class LinkFindingsRequest(BaseModel):
    finding_ids: list[str] = Field(min_length=1)


class ReportResponse(BaseModel):
    id: str
    project_id: str
    title: str
    summary: str
    affected_asset: str
    scope_confirmation: str
    prerequisites: str
    reproduction_steps: str
    expected_result: str
    actual_result: str
    impact: str
    severity_rationale: str
    cwe_id: str | None
    cvss_vector: str | None
    remediation: str
    limitations: str
    disclosure_timeline: list | None
    status: str
    format: str
    creator_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportFindingResponse(BaseModel):
    id: str
    report_id: str
    finding_id: str
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


async def _get_report_with_ownership(report_id: str, user: User, db: AsyncSession) -> Report:
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    project_result = await db.execute(select(Project).where(Project.id == report.project_id))
    project = project_result.scalar_one_or_none()
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return report


async def _get_linked_findings(report_id: str, db: AsyncSession) -> list[Finding]:
    result = await db.execute(
        select(Finding)
        .join(ReportFinding, ReportFinding.finding_id == Finding.id)
        .where(ReportFinding.report_id == report_id)
    )
    return list(result.scalars().all())


async def _get_evidence_for_findings(finding_ids: list[str], db: AsyncSession) -> list[EvidenceArtifact]:
    """Evidence is not directly linked to findings in the schema, so for report
    export we surface evidence via FindingVerification.evidence_ids referenced
    by the linked findings' verification records."""
    if not finding_ids:
        return []
    from app.models.findings import FindingVerification

    result = await db.execute(
        select(FindingVerification).where(FindingVerification.finding_id.in_(finding_ids))
    )
    verifications = list(result.scalars().all())

    evidence_ids: set[str] = set()
    for verification in verifications:
        for evidence_id in verification.evidence_ids or []:
            evidence_ids.add(evidence_id)

    if not evidence_ids:
        return []

    evidence_result = await db.execute(
        select(EvidenceArtifact).where(EvidenceArtifact.id.in_(evidence_ids))
    )
    return list(evidence_result.scalars().all())


# ── Routes ───────────────────────────────────────────────
@router.post("/projects/{project_id}/reports", response_model=ReportResponse, status_code=201)
async def create_report(
    project_id: str,
    body: CreateReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Report:
    """Create a new report in the 'draft' status within a project."""
    await _get_owned_project(project_id, user, db)

    report = Report(
        project_id=project_id,
        title=body.title,
        summary=body.summary,
        affected_asset=body.affected_asset,
        scope_confirmation=body.scope_confirmation,
        prerequisites=body.prerequisites,
        reproduction_steps=body.reproduction_steps,
        expected_result=body.expected_result,
        actual_result=body.actual_result,
        impact=body.impact,
        severity_rationale=body.severity_rationale,
        cwe_id=body.cwe_id,
        cvss_vector=body.cvss_vector,
        remediation=body.remediation,
        limitations=body.limitations,
        disclosure_timeline=body.disclosure_timeline,
        format=body.format,
        status="draft",
        creator_id=user.id,
    )
    db.add(report)
    await db.flush()

    audit = AuditEvent(
        event_type=AuditEventType.REPORT_GENERATE,
        actor_id=user.id,
        target_type="report",
        target_id=report.id,
        action="report.create",
        metadata_json=None,
    )
    db.add(audit)
    await db.flush()

    return report


@router.get("/projects/{project_id}/reports", response_model=list[ReportResponse])
async def list_reports(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Report]:
    """List reports within a project."""
    await _get_owned_project(project_id, user, db)

    result = await db.execute(
        select(Report).where(Report.project_id == project_id).order_by(Report.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/reports/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Report:
    """Get report details. Verifies ownership via the parent project."""
    return await _get_report_with_ownership(report_id, user, db)


@router.patch("/reports/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: str,
    body: UpdateReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Report:
    """Update a report's fields and/or lifecycle status."""
    report = await _get_report_with_ownership(report_id, user, db)

    update_data = body.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        setattr(report, field_name, value)

    await db.flush()
    await db.refresh(report)
    return report


@router.get("/reports/{report_id}/export")
async def export_report(
    report_id: str,
    format: str = "markdown",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export a report as markdown, html, or json."""
    if format not in REPORT_FORMATS:
        raise HTTPException(
            status_code=422, detail=f"format must be one of: {sorted(REPORT_FORMATS)}."
        )

    report = await _get_report_with_ownership(report_id, user, db)
    findings = await _get_linked_findings(report_id, db)
    finding_ids = [f.id for f in findings]
    evidence = await _get_evidence_for_findings(finding_ids, db)

    audit = AuditEvent(
        event_type=AuditEventType.REPORT_GENERATE,
        actor_id=user.id,
        target_type="report",
        target_id=report.id,
        action="report.export",
        metadata_json={"format": format},
    )
    db.add(audit)
    await db.flush()

    if format == "markdown":
        content = _generator.generate_markdown(report, findings, evidence)
        return Response(content=content, media_type="text/markdown")
    if format == "html":
        content = _generator.generate_html(report, findings, evidence)
        return Response(content=content, media_type="text/html")

    content = _generator.as_json_string(report, findings, evidence)
    return Response(content=content, media_type="application/json")


@router.post("/reports/{report_id}/findings", response_model=list[ReportFindingResponse], status_code=201)
async def link_findings(
    report_id: str,
    body: LinkFindingsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReportFinding]:
    """Link one or more findings to a report."""
    report = await _get_report_with_ownership(report_id, user, db)

    findings_result = await db.execute(
        select(Finding).where(Finding.id.in_(body.finding_ids), Finding.project_id == report.project_id)
    )
    found_findings = {f.id for f in findings_result.scalars().all()}
    missing = set(body.finding_ids) - found_findings
    if missing:
        raise HTTPException(
            status_code=404, detail=f"Findings not found in this project: {sorted(missing)}."
        )

    existing_result = await db.execute(
        select(ReportFinding.finding_id).where(
            ReportFinding.report_id == report_id, ReportFinding.finding_id.in_(body.finding_ids)
        )
    )
    already_linked = {row for row in existing_result.scalars().all()}

    created: list[ReportFinding] = []
    for finding_id in body.finding_ids:
        if finding_id in already_linked:
            continue
        link = ReportFinding(report_id=report_id, finding_id=finding_id)
        db.add(link)
        created.append(link)

    await db.flush()
    return created
