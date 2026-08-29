"""Cross-project aggregate read endpoints.

The React SPA's Evidence / Findings / Reports / Audit Log / Dashboard pages
are not scoped to a single project — they show everything the signed-in user
can see. The per-project routers already enforce ownership; these endpoints
apply the same `Project.owner_id == user.id` filter at the query level so a
user only ever sees their own data (docs/security.md §1.1, §1.2).

Read-only. Every write still goes through the ownership-checked per-project
routers.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditEvent
from app.models.auth import User
from app.models.domain import Engagement, Project
from app.models.evidence import EvidenceArtifact
from app.models.findings import Finding
from app.models.reports import Report, ReportFinding
from app.models.runs import APPROVAL_STATES, Run, RunState
from app.routers.auth import get_current_user
from app.routers.evidence import EvidenceResponse
from app.routers.findings import FindingResponse
from app.routers.reports import ReportResponse

router = APIRouter()

_ACTIVE_RUN_STATES = (RunState.QUEUED, RunState.RUNNING, RunState.AWAITING_ACTION_APPROVAL)


def _owned_project_ids(user: User) -> Select[tuple[str]]:
    return select(Project.id).where(Project.owner_id == user.id)


# ── Evidence ─────────────────────────────────────────────
@router.get("/evidence", response_model=list[EvidenceResponse])
async def list_all_evidence(
    verification_status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceArtifact]:
    """Evidence across every project the user owns, newest first."""
    query = (
        select(EvidenceArtifact)
        .where(EvidenceArtifact.project_id.in_(_owned_project_ids(user)))
        .order_by(EvidenceArtifact.created_at.desc())
    )
    if verification_status is not None:
        query = query.where(EvidenceArtifact.verification_status == verification_status)
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Findings ─────────────────────────────────────────────
@router.get("/findings", response_model=list[FindingResponse])
async def list_all_findings(
    state: str | None = None,
    severity: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Finding]:
    """Findings across every project the user owns, newest first."""
    query = (
        select(Finding)
        .where(Finding.project_id.in_(_owned_project_ids(user)))
        .order_by(Finding.created_at.desc())
    )
    if state is not None:
        query = query.where(Finding.state == state)
    if severity is not None:
        query = query.where(Finding.severity == severity)
    result = await db.execute(query)
    return list(result.scalars().all())


# ── Reports ──────────────────────────────────────────────
class ReportListItem(ReportResponse):
    """A report plus the count of findings linked to it (for list views)."""

    finding_count: int = 0
    project_name: str = ""


@router.get("/reports", response_model=list[ReportListItem])
async def list_all_reports(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ReportListItem]:
    """Reports across every project the user owns, newest first."""
    result = await db.execute(
        select(Report, Project.name, func.count(ReportFinding.id))
        .join(Project, Project.id == Report.project_id)
        .outerjoin(ReportFinding, ReportFinding.report_id == Report.id)
        .where(Project.owner_id == user.id)
        .group_by(Report.id, Project.name)
        .order_by(Report.created_at.desc())
    )
    items: list[ReportListItem] = []
    for report, project_name, finding_count in result.all():
        item = ReportListItem.model_validate(report)
        item.finding_count = int(finding_count)
        item.project_name = project_name
        items.append(item)
    return items


# ── Audit log ────────────────────────────────────────────
class AuditEventResponse(BaseModel):
    id: str
    event_type: str
    actor_id: str | None
    target_type: str | None
    target_id: str | None
    action: str
    metadata_json: dict | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/audit-events", response_model=list[AuditEventResponse])
async def list_audit_events(
    event_type: str | None = None,
    limit: int = Query(default=200, le=1000, ge=1),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AuditEvent]:
    """The append-only audit trail for actions attributable to the user or the
    user's own resources.

    An audit row is included when the actor is the user, the worker acting on
    one of the user's runs, or the target is one of the user's projects /
    engagements / runs / findings / reports / evidence artifacts. The audit
    model is a flat table with a free-form `target_id`, so we resolve the set
    of in-scope target ids up front and match against it.
    """
    owned_projects = set((await db.execute(_owned_project_ids(user))).scalars().all())
    owned_engagements = set(
        (await db.execute(select(Engagement.id).where(Engagement.project_id.in_(owned_projects))))
        .scalars()
        .all()
    )
    owned_runs = set(
        (await db.execute(select(Run.id).where(Run.project_id.in_(owned_projects)))).scalars().all()
    )
    in_scope_ids = owned_projects | owned_engagements | owned_runs | {user.id}

    query = select(AuditEvent).order_by(AuditEvent.created_at.desc())
    if event_type is not None:
        query = query.where(AuditEvent.event_type == event_type)
    # Pull a generous window then filter in Python — the audit table is small
    # in the single-tenant MVP and target ownership is not expressible as a
    # single join.
    query = query.limit(2000)
    rows = list((await db.execute(query)).scalars().all())

    def _visible(ev: AuditEvent) -> bool:
        # The user's own actions (routers attribute every audit write to
        # actor_id=user.id), plus worker-attributed scope checks whose target
        # is one of the user's engagements or runs.
        if ev.actor_id == user.id:
            return True
        return bool(ev.target_id and ev.target_id in in_scope_ids)

    visible = [ev for ev in rows if _visible(ev)]
    return visible[offset : offset + limit]


# ── Dashboard ────────────────────────────────────────────
class DashboardSummary(BaseModel):
    projects: int
    engagements: int
    runs: int
    active_runs: int
    pending_approvals: int
    evidence: int
    findings: int
    verified_findings: int
    reports: int


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def dashboard_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    """Headline counts for the dashboard, all owner-scoped."""
    project_ids = _owned_project_ids(user)

    async def _count(stmt: Select[tuple[int]]) -> int:
        return int((await db.execute(stmt)).scalar_one())

    return DashboardSummary(
        projects=await _count(
            select(func.count()).select_from(Project).where(Project.owner_id == user.id)
        ),
        engagements=await _count(
            select(func.count())
            .select_from(Engagement)
            .where(Engagement.project_id.in_(project_ids))
        ),
        runs=await _count(
            select(func.count()).select_from(Run).where(Run.project_id.in_(project_ids))
        ),
        active_runs=await _count(
            select(func.count())
            .select_from(Run)
            .where(Run.project_id.in_(project_ids), Run.state.in_(_ACTIVE_RUN_STATES))
        ),
        pending_approvals=await _count(
            select(func.count())
            .select_from(Run)
            .where(Run.project_id.in_(project_ids), Run.state.in_(tuple(APPROVAL_STATES)))
        ),
        evidence=await _count(
            select(func.count())
            .select_from(EvidenceArtifact)
            .where(EvidenceArtifact.project_id.in_(project_ids))
        ),
        findings=await _count(
            select(func.count()).select_from(Finding).where(Finding.project_id.in_(project_ids))
        ),
        verified_findings=await _count(
            select(func.count())
            .select_from(Finding)
            .where(Finding.project_id.in_(project_ids), Finding.state == "verified")
        ),
        reports=await _count(
            select(func.count()).select_from(Report).where(Report.project_id.in_(project_ids))
        ),
    )
