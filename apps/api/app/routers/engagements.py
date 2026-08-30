"""Engagement management routes, scoped within a project."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditEvent, AuditEventType
from app.models.auth import User
from app.models.domain import Engagement, Project
from app.routers.auth import get_current_user

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────
class CreateEngagementRequest(BaseModel):
    program_name: str = Field(min_length=1, max_length=200)
    authorization_basis: str = Field(default="", max_length=4000)
    start_date: date | None = None
    end_date: date | None = None
    notes: str = Field(default="", max_length=4000)


class UpdateEngagementRequest(BaseModel):
    program_name: str | None = Field(default=None, min_length=1, max_length=200)
    authorization_basis: str | None = Field(default=None, max_length=4000)
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=4000)


class EngagementResponse(BaseModel):
    id: str
    project_id: str
    program_name: str
    authorization_basis: str
    start_date: date | None
    end_date: date | None
    status: str
    notes: str
    created_at: datetime
    updated_at: datetime

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


async def _get_engagement_with_ownership(
    engagement_id: str, user: User, db: AsyncSession
) -> Engagement:
    result = await db.execute(select(Engagement).where(Engagement.id == engagement_id))
    engagement = result.scalar_one_or_none()
    if not engagement:
        raise HTTPException(status_code=404, detail="Engagement not found.")

    project_result = await db.execute(select(Project).where(Project.id == engagement.project_id))
    project = project_result.scalar_one_or_none()
    if not project or project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    return engagement


# ── Routes ───────────────────────────────────────────────
@router.post(
    "/projects/{project_id}/engagements", response_model=EngagementResponse, status_code=201
)
async def create_engagement(
    project_id: str,
    body: CreateEngagementRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Engagement:
    """Create a new engagement within a project. Verifies project ownership."""
    await _get_owned_project(project_id, user, db)

    engagement = Engagement(
        project_id=project_id,
        program_name=body.program_name,
        authorization_basis=body.authorization_basis,
        start_date=body.start_date,
        end_date=body.end_date,
        notes=body.notes,
    )
    db.add(engagement)
    await db.flush()

    db.add(
        AuditEvent(
            event_type=AuditEventType.ENGAGEMENT_CREATE,
            actor_id=user.id,
            target_type="engagement",
            target_id=engagement.id,
            action="engagement.create",
            metadata_json={"program_name": engagement.program_name},
        )
    )
    await db.flush()
    return engagement


@router.get("/projects/{project_id}/engagements", response_model=list[EngagementResponse])
async def list_engagements(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Engagement]:
    """List engagements within a project. Verifies project ownership."""
    await _get_owned_project(project_id, user, db)

    result = await db.execute(
        select(Engagement)
        .where(Engagement.project_id == project_id)
        .order_by(Engagement.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/engagements/{engagement_id}", response_model=EngagementResponse)
async def get_engagement(
    engagement_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Engagement:
    """Get engagement details. Verifies ownership via the parent project."""
    return await _get_engagement_with_ownership(engagement_id, user, db)


@router.put("/engagements/{engagement_id}", response_model=EngagementResponse)
async def update_engagement(
    engagement_id: str,
    body: UpdateEngagementRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Engagement:
    """Update an engagement. Verifies ownership via the parent project."""
    engagement = await _get_engagement_with_ownership(engagement_id, user, db)

    update_data = body.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        setattr(engagement, field_name, value)

    await db.flush()
    await db.refresh(engagement)
    return engagement
