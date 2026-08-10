"""Finding routes — hypothesis-driven finding lifecycle and verification records."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditEvent, AuditEventType
from app.models.auth import User
from app.models.domain import Project
from app.models.findings import (
    FINDING_SEVERITIES,
    FINDING_STATES,
    FINDING_VERIFICATION_RESULTS,
    Finding,
    FindingVerification,
)
from app.routers.auth import get_current_user

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────
class CreateFindingRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    observation: str = Field(default="", max_length=8000)
    hypothesis: str = Field(default="", max_length=8000)
    verification_method: str = Field(default="", max_length=8000)
    actual_result: str = Field(default="", max_length=8000)
    expected_result: str = Field(default="", max_length=8000)
    affected_scope: str = Field(default="", max_length=500)
    security_impact: str = Field(default="", max_length=8000)
    uncertainty: str = Field(default="", max_length=8000)
    severity: str = Field(max_length=20)
    suggested_severity: str | None = Field(default=None, max_length=20)
    cwe_id: str | None = Field(default=None, max_length=20)
    cvss_vector: str | None = Field(default=None, max_length=200)
    remediation: str = Field(default="", max_length=8000)
    disclosure_status: str = Field(default="internal", max_length=50)

    @field_validator("severity")
    @classmethod
    def _validate_severity(cls, value: str) -> str:
        if value not in FINDING_SEVERITIES:
            raise ValueError(f"severity must be one of: {sorted(FINDING_SEVERITIES)}")
        return value

    @field_validator("suggested_severity")
    @classmethod
    def _validate_suggested_severity(cls, value: str | None) -> str | None:
        if value is not None and value not in FINDING_SEVERITIES:
            raise ValueError(f"suggested_severity must be one of: {sorted(FINDING_SEVERITIES)}")
        return value


class UpdateFindingRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    observation: str | None = Field(default=None, max_length=8000)
    hypothesis: str | None = Field(default=None, max_length=8000)
    verification_method: str | None = Field(default=None, max_length=8000)
    actual_result: str | None = Field(default=None, max_length=8000)
    expected_result: str | None = Field(default=None, max_length=8000)
    affected_scope: str | None = Field(default=None, max_length=500)
    security_impact: str | None = Field(default=None, max_length=8000)
    uncertainty: str | None = Field(default=None, max_length=8000)
    severity: str | None = Field(default=None, max_length=20)
    suggested_severity: str | None = Field(default=None, max_length=20)
    cwe_id: str | None = Field(default=None, max_length=20)
    cvss_vector: str | None = Field(default=None, max_length=200)
    remediation: str | None = Field(default=None, max_length=8000)
    disclosure_status: str | None = Field(default=None, max_length=50)
    state: str | None = Field(default=None, max_length=50)

    @field_validator("severity")
    @classmethod
    def _validate_severity(cls, value: str | None) -> str | None:
        if value is not None and value not in FINDING_SEVERITIES:
            raise ValueError(f"severity must be one of: {sorted(FINDING_SEVERITIES)}")
        return value

    @field_validator("suggested_severity")
    @classmethod
    def _validate_suggested_severity(cls, value: str | None) -> str | None:
        if value is not None and value not in FINDING_SEVERITIES:
            raise ValueError(f"suggested_severity must be one of: {sorted(FINDING_SEVERITIES)}")
        return value

    @field_validator("state")
    @classmethod
    def _validate_state(cls, value: str | None) -> str | None:
        if value is not None and value not in FINDING_STATES:
            raise ValueError(f"state must be one of: {sorted(FINDING_STATES)}")
        return value


class CreateFindingVerificationRequest(BaseModel):
    method: str = Field(default="", max_length=200)
    result: str = Field(max_length=50)
    notes: str = Field(default="", max_length=4000)
    evidence_ids: list[str] = Field(default_factory=list)

    @field_validator("result")
    @classmethod
    def _validate_result(cls, value: str) -> str:
        if value not in FINDING_VERIFICATION_RESULTS:
            raise ValueError(f"result must be one of: {sorted(FINDING_VERIFICATION_RESULTS)}")
        return value


class FindingResponse(BaseModel):
    id: str
    project_id: str
    title: str
    observation: str
    hypothesis: str
    verification_method: str
    actual_result: str
    expected_result: str
    affected_scope: str
    security_impact: str
    uncertainty: str
    severity: str
    suggested_severity: str | None
    cwe_id: str | None
    cvss_vector: str | None
    remediation: str
    disclosure_status: str
    state: str
    creator_id: str
    reviewer_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FindingVerificationResponse(BaseModel):
    id: str
    finding_id: str
    verifier_id: str
    method: str
    result: str
    notes: str
    evidence_ids: list[str] | None
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


async def _get_finding_with_ownership(finding_id: str, user: User, db: AsyncSession) -> Finding:
    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found.")

    project_result = await db.execute(select(Project).where(Project.id == finding.project_id))
    project = project_result.scalar_one_or_none()
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return finding


# ── Routes ───────────────────────────────────────────────
@router.post("/projects/{project_id}/findings", response_model=FindingResponse, status_code=201)
async def create_finding(
    project_id: str,
    body: CreateFindingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Finding:
    """Create a new finding in the 'candidate' state within a project."""
    await _get_owned_project(project_id, user, db)

    finding = Finding(
        project_id=project_id,
        title=body.title,
        observation=body.observation,
        hypothesis=body.hypothesis,
        verification_method=body.verification_method,
        actual_result=body.actual_result,
        expected_result=body.expected_result,
        affected_scope=body.affected_scope,
        security_impact=body.security_impact,
        uncertainty=body.uncertainty,
        severity=body.severity,
        suggested_severity=body.suggested_severity,
        cwe_id=body.cwe_id,
        cvss_vector=body.cvss_vector,
        remediation=body.remediation,
        disclosure_status=body.disclosure_status,
        state="candidate",
        creator_id=user.id,
    )
    db.add(finding)
    await db.flush()

    audit = AuditEvent(
        event_type=AuditEventType.FINDING_CREATE,
        actor_id=user.id,
        target_type="finding",
        target_id=finding.id,
        action="finding.create",
        metadata_json={"severity": body.severity},
    )
    db.add(audit)
    await db.flush()

    return finding


@router.get("/projects/{project_id}/findings", response_model=list[FindingResponse])
async def list_findings(
    project_id: str,
    state: str | None = None,
    severity: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Finding]:
    """List findings within a project, optionally filtered by state and/or severity."""
    await _get_owned_project(project_id, user, db)

    query = select(Finding).where(Finding.project_id == project_id)
    if state is not None:
        query = query.where(Finding.state == state)
    if severity is not None:
        query = query.where(Finding.severity == severity)

    result = await db.execute(query.order_by(Finding.created_at.desc()))
    return list(result.scalars().all())


@router.get("/findings/{finding_id}", response_model=FindingResponse)
async def get_finding(
    finding_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Finding:
    """Get finding details. Verifies ownership via the parent project."""
    return await _get_finding_with_ownership(finding_id, user, db)


@router.patch("/findings/{finding_id}", response_model=FindingResponse)
async def update_finding(
    finding_id: str,
    body: UpdateFindingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Finding:
    """Update a finding's details and/or lifecycle state."""
    finding = await _get_finding_with_ownership(finding_id, user, db)

    update_data = body.model_dump(exclude_unset=True)
    previous_state = finding.state
    for field_name, value in update_data.items():
        setattr(finding, field_name, value)

    await db.flush()

    if "state" in update_data and update_data["state"] != previous_state:
        audit = AuditEvent(
            event_type=AuditEventType.FINDING_CREATE,
            actor_id=user.id,
            target_type="finding",
            target_id=finding.id,
            action="finding.state_change",
            metadata_json={"from_state": previous_state, "to_state": finding.state},
        )
        db.add(audit)
        await db.flush()

    await db.refresh(finding)
    return finding


@router.post(
    "/findings/{finding_id}/verify",
    response_model=FindingVerificationResponse,
    status_code=201,
)
async def verify_finding(
    finding_id: str,
    body: CreateFindingVerificationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FindingVerification:
    """Record a verification attempt (confirmed/denied/inconclusive) against a finding."""
    finding = await _get_finding_with_ownership(finding_id, user, db)

    verification = FindingVerification(
        finding_id=finding.id,
        verifier_id=user.id,
        method=body.method,
        result=body.result,
        notes=body.notes,
        evidence_ids=body.evidence_ids,
    )
    db.add(verification)

    if body.result == "confirmed":
        finding.state = "verified"
    elif body.result == "denied":
        finding.state = "rejected"

    await db.flush()

    return verification
