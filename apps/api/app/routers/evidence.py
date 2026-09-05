"""Evidence artifact routes — upload, list, retrieve, and verification review."""

import hashlib
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.middleware.rbac import Role, require_role
from app.models.audit import AuditEvent, AuditEventType
from app.models.auth import User
from app.models.domain import Project
from app.models.evidence import EVIDENCE_VERIFICATION_STATUSES, EvidenceArtifact
from app.routers.auth import get_current_user
from app.services.evidence_upload import UploadValidationError, sanitize_filename, validate_upload
from app.services.storage import get_storage_backend

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────
class EvidenceResponse(BaseModel):
    id: str
    project_id: str
    engagement_id: str | None
    run_id: str | None
    run_step_id: str | None
    creator_id: str
    source: str
    acquisition_timestamp: datetime | None
    content_type: str
    original_filename: str
    storage_path: str
    file_size: int
    sha256_digest: str
    sensitivity: str
    verification_status: str
    reviewer_id: str | None
    retention_deadline: date | None
    parent_id: str | None
    notes: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VerifyEvidenceRequest(BaseModel):
    verification_status: str = Field(max_length=50)
    notes: str = Field(default="", max_length=4000)

    def validate_status(self) -> None:
        if self.verification_status not in EVIDENCE_VERIFICATION_STATUSES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Invalid verification_status '{self.verification_status}'. "
                    f"Must be one of: {sorted(EVIDENCE_VERIFICATION_STATUSES)}."
                ),
            )


# ── Helpers ──────────────────────────────────────────────
async def _get_owned_project(project_id: str, user: User, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return project


async def _get_evidence_with_ownership(
    evidence_id: str, user: User, db: AsyncSession
) -> EvidenceArtifact:
    result = await db.execute(select(EvidenceArtifact).where(EvidenceArtifact.id == evidence_id))
    evidence = result.scalar_one_or_none()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence artifact not found.")

    project_result = await db.execute(select(Project).where(Project.id == evidence.project_id))
    project = project_result.scalar_one_or_none()
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return evidence


def _storage_path(project_id: str, evidence_id: str, filename: str) -> str:
    safe_name = sanitize_filename(filename)
    return f"evidence/{project_id}/{evidence_id}/{safe_name}"


# ── Routes ───────────────────────────────────────────────
@router.post("/projects/{project_id}/evidence", response_model=EvidenceResponse, status_code=201)
async def upload_evidence(
    project_id: str,
    file: UploadFile = File(...),
    source: str = Form(default=""),
    engagement_id: str | None = Form(default=None),
    run_id: str | None = Form(default=None),
    run_step_id: str | None = Form(default=None),
    sensitivity: str = Form(default="standard"),
    notes: str = Form(default=""),
    acquisition_timestamp: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EvidenceArtifact:
    """Upload a new evidence artifact, computing its SHA-256 digest and storing the bytes."""
    await _get_owned_project(project_id, user, db)

    data = await file.read()
    try:
        safe_filename, stored_content_type = validate_upload(
            file.filename, file.content_type, data, limit=get_settings().evidence_max_upload_bytes
        )
    except UploadValidationError as e:
        raise HTTPException(status_code=getattr(e, "status_code", 422), detail=str(e)) from None
    digest = hashlib.sha256(data).hexdigest()

    parsed_acquisition_timestamp: datetime | None = None
    if acquisition_timestamp:
        try:
            parsed_acquisition_timestamp = datetime.fromisoformat(acquisition_timestamp)
        except ValueError:
            raise HTTPException(
                status_code=422, detail="Invalid acquisition_timestamp format."
            ) from None

    evidence = EvidenceArtifact(
        project_id=project_id,
        engagement_id=engagement_id,
        run_id=run_id,
        run_step_id=run_step_id,
        creator_id=user.id,
        source=source,
        acquisition_timestamp=parsed_acquisition_timestamp,
        content_type=stored_content_type,
        original_filename=safe_filename,
        file_size=len(data),
        sha256_digest=digest,
        sensitivity=sensitivity,
        notes=notes,
        verification_status="unreviewed",
    )
    db.add(evidence)
    await db.flush()
    await db.commit()

    storage_path = _storage_path(project_id, evidence.id, evidence.original_filename)
    backend = get_storage_backend()
    await backend.upload(storage_path, data, evidence.content_type)
    evidence.storage_path = storage_path
    await db.flush()
    await db.commit()

    audit = AuditEvent(
        event_type=AuditEventType.EVIDENCE_UPLOAD,
        actor_id=user.id,
        target_type="evidence_artifact",
        target_id=evidence.id,
        action="evidence.upload",
        metadata_json={"sha256_digest": digest, "file_size": evidence.file_size},
    )
    db.add(audit)
    await db.flush()
    await db.refresh(evidence)
    await db.commit()

    return evidence


@router.get("/projects/{project_id}/evidence", response_model=list[EvidenceResponse])
async def list_evidence(
    project_id: str,
    verification_status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceArtifact]:
    """List evidence artifacts within a project, optionally filtered by verification_status."""
    await _get_owned_project(project_id, user, db)

    query = select(EvidenceArtifact).where(EvidenceArtifact.project_id == project_id)
    if verification_status is not None:
        query = query.where(EvidenceArtifact.verification_status == verification_status)

    result = await db.execute(query.order_by(EvidenceArtifact.created_at.desc()))
    return list(result.scalars().all())


@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
async def get_evidence(
    evidence_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EvidenceArtifact:
    """Get evidence artifact details. Verifies ownership via the parent project."""
    return await _get_evidence_with_ownership(evidence_id, user, db)


@router.patch("/evidence/{evidence_id}/verify", response_model=EvidenceResponse)
async def verify_evidence(
    evidence_id: str,
    body: VerifyEvidenceRequest,
    user: User = Depends(require_role(Role.REVIEWER, Role.OWNER, Role.ADMINISTRATOR)),
    db: AsyncSession = Depends(get_db),
) -> EvidenceArtifact:
    """Update the verification status of an evidence artifact. Requires reviewer role."""
    body.validate_status()

    result = await db.execute(select(EvidenceArtifact).where(EvidenceArtifact.id == evidence_id))
    evidence = result.scalar_one_or_none()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence artifact not found.")

    project_result = await db.execute(select(Project).where(Project.id == evidence.project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")

    evidence.verification_status = body.verification_status
    evidence.reviewer_id = user.id
    if body.notes:
        evidence.notes = body.notes

    await db.flush()
    await db.commit()

    audit = AuditEvent(
        event_type=AuditEventType.EVIDENCE_UPLOAD,
        actor_id=user.id,
        target_type="evidence_artifact",
        target_id=evidence.id,
        action="evidence.verify",
        metadata_json={"verification_status": body.verification_status},
    )
    db.add(audit)
    await db.flush()
    await db.refresh(evidence)
    await db.commit()

    return evidence
