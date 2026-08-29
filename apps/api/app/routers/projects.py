"""Project management routes."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.auth import User
from app.models.domain import Project
from app.routers.auth import get_current_user

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str
    status: str
    owner_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[ProjectResponse])
@router.get("/", response_model=list[ProjectResponse], include_in_schema=False)
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    """List projects the user owns or is a member of."""
    result = await db.execute(
        select(Project).where(Project.owner_id == user.id).order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=ProjectResponse, status_code=201)
@router.post("/", response_model=ProjectResponse, status_code=201, include_in_schema=False)
async def create_project(
    body: CreateProjectRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Create a new project."""
    project = Project(
        name=body.name,
        description=body.description,
        owner_id=user.id,
    )
    db.add(project)
    await db.flush()
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """Get project details. Verifies ownership."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    return project
