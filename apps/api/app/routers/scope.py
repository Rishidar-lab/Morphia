"""Scope rule management routes, scoped within an engagement."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditEvent, AuditEventType
from app.models.auth import User
from app.models.domain import Engagement, Project, ScopeRule
from app.routers.auth import get_current_user
from app.services.target_safety import prohibited_scope_pattern_reason

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────
class CreateScopeRuleRequest(BaseModel):
    rule_type: str = Field(pattern="^(include|exclude)$")
    target_type: str = Field(min_length=1, max_length=50)
    pattern: str = Field(min_length=1, max_length=500)
    is_wildcard: bool = False
    notes: str = Field(default="", max_length=2000)


class ScopeRuleResponse(BaseModel):
    id: str
    engagement_id: str
    rule_type: str
    target_type: str
    pattern: str
    is_wildcard: bool
    notes: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Helpers ──────────────────────────────────────────────
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


async def _get_scope_rule_with_ownership(
    scope_rule_id: str, user: User, db: AsyncSession
) -> ScopeRule:
    result = await db.execute(select(ScopeRule).where(ScopeRule.id == scope_rule_id))
    scope_rule = result.scalar_one_or_none()
    if not scope_rule:
        raise HTTPException(status_code=404, detail="Scope rule not found.")

    # Verify the full ownership chain: scope rule -> engagement -> project.
    await _get_engagement_with_ownership(scope_rule.engagement_id, user, db)
    return scope_rule


# ── Routes ───────────────────────────────────────────────
@router.post(
    "/engagements/{engagement_id}/scope", response_model=ScopeRuleResponse, status_code=201
)
async def create_scope_rule(
    engagement_id: str,
    body: CreateScopeRuleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ScopeRule:
    """Create a scope rule within an engagement. Verifies ownership chain."""
    await _get_engagement_with_ownership(engagement_id, user, db)

    if body.rule_type == "include":
        unsafe = prohibited_scope_pattern_reason(body.pattern)
        if unsafe is not None:
            raise HTTPException(status_code=422, detail=unsafe)

    scope_rule = ScopeRule(
        engagement_id=engagement_id,
        rule_type=body.rule_type,
        target_type=body.target_type,
        pattern=body.pattern,
        is_wildcard=body.is_wildcard,
        notes=body.notes,
    )
    db.add(scope_rule)
    await db.flush()

    db.add(
        AuditEvent(
            event_type=AuditEventType.SCOPE_MODIFY,
            actor_id=user.id,
            target_type="scope_rule",
            target_id=scope_rule.id,
            action="create",
            metadata_json={
                "engagement_id": engagement_id,
                "rule_type": body.rule_type,
                "pattern": body.pattern,
            },
        )
    )
    await db.flush()

    return scope_rule


@router.get("/engagements/{engagement_id}/scope", response_model=list[ScopeRuleResponse])
async def list_scope_rules(
    engagement_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ScopeRule]:
    """List scope rules within an engagement. Verifies ownership chain."""
    await _get_engagement_with_ownership(engagement_id, user, db)

    result = await db.execute(
        select(ScopeRule)
        .where(ScopeRule.engagement_id == engagement_id)
        .order_by(ScopeRule.created_at.desc())
    )
    return list(result.scalars().all())


@router.delete("/scope/{scope_rule_id}", status_code=204)
async def delete_scope_rule(
    scope_rule_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a scope rule. Verifies the full ownership chain."""
    scope_rule = await _get_scope_rule_with_ownership(scope_rule_id, user, db)

    db.add(
        AuditEvent(
            event_type=AuditEventType.SCOPE_MODIFY,
            actor_id=user.id,
            target_type="scope_rule",
            target_id=scope_rule.id,
            action="delete",
            metadata_json={
                "engagement_id": scope_rule.engagement_id,
                "rule_type": scope_rule.rule_type,
                "pattern": scope_rule.pattern,
            },
        )
    )
    await db.delete(scope_rule)
    await db.flush()
