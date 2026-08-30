"""Local demo/development seed.

Usage:
    SEED_ADMIN_PASSWORD=... python -m app.seed

Builds the canonical MORPHIA demo workspace, idempotently:

    Owner user (admin@morphia.example.com)
      └─ Project "Morphia Demo Research"
           └─ Engagement "Authorized Local Security Validation" (active)
                ├─ Scope: include  demo-target        (synthetic local target)
                ├─ Scope: include  demo-target:9000
                └─ Scope: exclude  production.example.com  (out-of-scope, for the denial demo)
           ├─ Run "Baseline HTTP Security Review" — COMPLETED, with one step,
           │     its event trail, one hash-verified evidence artifact, and
           │     one verified (synthetic) finding.
           └─ Report "Authorized Local Validation — Baseline HTTP Review"
                 linking the finding, in `review` status.

Every demonstration artifact is explicitly marked synthetic. This is dev/demo
data only — it refuses to run when ENVIRONMENT=production and refuses to
create a known-password account without an explicit SEED_ADMIN_PASSWORD.

For a *live* end-to-end run (worker actually executes, scope-denial path
included) use `scripts/demo.sh`, which layers on top of this seed.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session as SyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.audit import AuditEvent, AuditEventType
from app.models.auth import User
from app.models.domain import Engagement, Project, ScopeRule
from app.models.evidence import EvidenceArtifact
from app.models.findings import Finding, FindingVerification
from app.models.reports import Report, ReportFinding
from app.models.runs import Run, RunEvent, RunState, RunStep

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@morphia.example.com")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "")
ADMIN_DISPLAY_NAME = os.environ.get("SEED_ADMIN_DISPLAY_NAME", "MORPHIA Demo Owner")

PROJECT_NAME = "Morphia Demo Research"
ENGAGEMENT_NAME = "Authorized Local Security Validation"
RUN_TITLE = "Baseline HTTP Security Review"
RUN_TITLE_AWAITING = "Header Hardening Review — Awaiting Approval"
RUN_TITLE_FAILED = "Out-of-Scope Probe — Blocked by Policy"
FINDING_TITLE = "[SYNTHETIC DEMO] Permissive CORS policy on demo target"
REPORT_TITLE = "Authorized Local Validation — Baseline HTTP Review"

DEMO_TARGET = "demo-target"

EVIDENCE_BODY = json.dumps(
    {
        "synthetic": True,
        "captured_by": "MORPHIA worker (mock provider)",
        "target": f"http://{DEMO_TARGET}:9000/headers",
        "observed_response_headers": {
            "Server": "morphia-demo-target/1.0 (synthetic; authorized MORPHIA demo)",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
            "X-Morphia-Demo": "true",
        },
        "note": "Synthetic capture for the MORPHIA demonstration. Not a real target.",
    },
    indent=2,
).encode()


def get_sync_session_factory() -> sessionmaker[SyncSession]:
    settings = get_settings()
    sync_url = settings.database_url_sync or settings.database_url.replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    engine = create_engine(sync_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, class_=SyncSession, expire_on_commit=False)


def _get_or_create_user(db: SyncSession, email: str, display_name: str, role: str) -> User:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user:
        print(f"[seed] user exists: {email}")
        return user
    user = User(
        email=email,
        password_hash=hash_password(ADMIN_PASSWORD),
        display_name=display_name,
        role=role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    print(f"[seed] created user: {email} ({role})")
    return user


def _get_or_create_project(db: SyncSession, owner: User) -> Project:
    project = db.execute(
        select(Project).where(Project.name == PROJECT_NAME, Project.owner_id == owner.id)
    ).scalar_one_or_none()
    if project:
        print(f"[seed] project exists: {PROJECT_NAME}")
        return project
    project = Project(
        name=PROJECT_NAME,
        description=(
            "Canonical MORPHIA demonstration workspace. Exercises the full "
            "human-in-the-loop pipeline against a synthetic local target."
        ),
        status="active",
        owner_id=owner.id,
    )
    db.add(project)
    db.flush()
    db.add(
        AuditEvent(
            event_type=AuditEventType.PROJECT_CREATE,
            actor_id=owner.id,
            target_type="project",
            target_id=project.id,
            action="project.create",
            metadata_json={"seeded": True},
        )
    )
    db.flush()
    print(f"[seed] created project: {PROJECT_NAME}")
    return project


def _get_or_create_engagement(db: SyncSession, project: Project, owner: User) -> Engagement:
    engagement = db.execute(
        select(Engagement).where(
            Engagement.project_id == project.id,
            Engagement.program_name == ENGAGEMENT_NAME,
        )
    ).scalar_one_or_none()
    if engagement:
        print(f"[seed] engagement exists: {ENGAGEMENT_NAME}")
        return engagement
    engagement = Engagement(
        project_id=project.id,
        program_name=ENGAGEMENT_NAME,
        authorization_basis=(
            "Self-authorized: the target (compose service `demo-target`) is a "
            "synthetic service owned and operated by this MORPHIA instance for "
            "demonstration. No third-party systems are in scope."
        ),
        start_date=(datetime.now(UTC) - timedelta(days=1)).date(),
        end_date=(datetime.now(UTC) + timedelta(days=365)).date(),
        status="active",
        notes="Seeded demo engagement. All activity is against a synthetic local target.",
    )
    db.add(engagement)
    db.flush()
    db.add(
        AuditEvent(
            event_type=AuditEventType.ENGAGEMENT_CREATE,
            actor_id=owner.id,
            target_type="engagement",
            target_id=engagement.id,
            action="engagement.create",
            metadata_json={"seeded": True},
        )
    )
    db.flush()
    print(f"[seed] created engagement: {ENGAGEMENT_NAME}")
    return engagement


def _seed_scope_rules(db: SyncSession, engagement: Engagement, owner: User) -> None:
    existing = (
        db.execute(select(ScopeRule).where(ScopeRule.engagement_id == engagement.id))
        .scalars()
        .all()
    )
    if existing:
        print(f"[seed] scope rules exist ({len(existing)})")
        return
    rules = [
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="include",
            target_type="domain",
            pattern=DEMO_TARGET,
            is_wildcard=False,
            notes="Synthetic local demo target (compose service demo-target:9000).",
        ),
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="include",
            target_type="domain",
            pattern=f"{DEMO_TARGET}:9000",
            is_wildcard=False,
            notes="Synthetic local demo target with explicit port.",
        ),
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="exclude",
            target_type="domain",
            pattern="production.example.com",
            is_wildcard=False,
            notes="Illustrative out-of-scope host. Used by the scope-denial demonstration.",
        ),
    ]
    db.add_all(rules)
    db.flush()
    for rule in rules:
        db.add(
            AuditEvent(
                event_type=AuditEventType.SCOPE_MODIFY,
                actor_id=owner.id,
                target_type="scope_rule",
                target_id=rule.id,
                action="create",
                metadata_json={
                    "engagement_id": engagement.id,
                    "rule_type": rule.rule_type,
                    "pattern": rule.pattern,
                    "seeded": True,
                },
            )
        )
    db.flush()
    print(f"[seed] created {len(rules)} scope rules")


def _seed_completed_run(
    db: SyncSession, project: Project, engagement: Engagement, owner: User
) -> Run:
    # The report is the last artifact built here, so its presence means the
    # whole chain (run → step → evidence → finding → report) is already
    # seeded. If a partial chain exists (e.g. a bare run from an interrupted
    # earlier seed), clear it and rebuild so the demo workspace is complete.
    report_exists = db.execute(
        select(Report).where(Report.project_id == project.id, Report.title == REPORT_TITLE)
    ).scalar_one_or_none()
    existing_run = db.execute(
        select(Run).where(Run.project_id == project.id, Run.title == RUN_TITLE)
    ).scalar_one_or_none()
    if report_exists and existing_run:
        print("[seed] completed run + evidence + finding + report already present")
        return existing_run
    if existing_run:
        print("[seed] found a partial demo run — rebuilding the full chain")
        db.execute(delete(EvidenceArtifact).where(EvidenceArtifact.run_id == existing_run.id))
        db.execute(delete(Finding).where(Finding.title == FINDING_TITLE))
        db.delete(existing_run)
        db.flush()

    plan = {
        "steps": [
            {
                "action": "http_header_review",
                "target": DEMO_TARGET,
                "prompt": (
                    "Review the HTTP response headers of the authorized synthetic "
                    "target demo-target:9000. Note any header that would be a "
                    "hardening concern on a real service. Do not perform any "
                    "intrusive testing."
                ),
            }
        ]
    }
    run = Run(
        project_id=project.id,
        engagement_id=engagement.id,
        title=RUN_TITLE,
        agent_profile="passive_recon",
        plan=plan,
        state=RunState.COMPLETED,
        created_by=owner.id,
    )
    db.add(run)
    db.flush()

    now = datetime.now(UTC)
    transitions = [
        ("run.created", None, "DRAFT", owner.id, None),
        ("run.transition", "DRAFT", "PLANNING", owner.id, None),
        ("run.transition", "PLANNING", "AWAITING_PLAN_APPROVAL", owner.id, None),
        (
            "approval.decide",
            "AWAITING_PLAN_APPROVAL",
            "QUEUED",
            owner.id,
            {
                "decision": "approved",
                "justification": "Plan reviewed. Synthetic target, passive only.",
            },
        ),
        ("run.claimed", "QUEUED", "RUNNING", "worker:seed", None),
        (
            "run.step_completed",
            None,
            None,
            "worker:seed",
            {"step_number": 1, "status": "completed"},
        ),
        ("run.transition", "RUNNING", "COMPLETED", "worker:seed", None),
    ]
    for i, (etype, frm, to, actor, payload) in enumerate(transitions):
        db.add(
            RunEvent(
                run_id=run.id,
                event_type=etype,
                from_state=frm,
                to_state=to,
                actor_id=actor,
                payload=payload,
                created_at=now + timedelta(seconds=i),
            )
        )

    step = RunStep(
        run_id=run.id,
        step_number=1,
        action="http_header_review",
        status="completed",
        input_data={"target": DEMO_TARGET, "action": "http_header_review"},
        output_data={
            "response": (
                "[mock-provider deterministic response] Reviewed response headers "
                "for demo-target:9000. Observed: Server banner disclosed; "
                "Access-Control-Allow-Origin is '*' (permissive CORS). "
                "X-Content-Type-Options present. No intrusive testing performed."
            ),
            "provider": "mock",
            "model": "mock-1",
            "estimated_cost_usd": 0.0,
        },
        idempotency_key=f"{run.id}:1",
    )
    db.add(step)
    db.flush()

    # Evidence artifact — write the blob and record its SHA-256.
    digest = hashlib.sha256(EVIDENCE_BODY).hexdigest()
    settings = get_settings()
    storage_root = Path(settings.storage_local_path)
    storage_path = f"evidence/{project.id}/seed-{run.id}/response-headers.json"
    blob_path = storage_root / storage_path
    blob_path.parent.mkdir(parents=True, exist_ok=True)
    blob_path.write_bytes(EVIDENCE_BODY)

    evidence = EvidenceArtifact(
        project_id=project.id,
        engagement_id=engagement.id,
        run_id=run.id,
        run_step_id=step.id,
        creator_id=owner.id,
        source="worker:seed",
        acquisition_timestamp=now,
        content_type="application/json",
        original_filename="response-headers.json",
        storage_path=storage_path,
        file_size=len(EVIDENCE_BODY),
        sha256_digest=digest,
        sensitivity="standard",
        verification_status="integrity_verified",
        notes="Synthetic response-header capture from the demo target.",
    )
    db.add(evidence)
    db.flush()
    db.add(
        AuditEvent(
            event_type=AuditEventType.EVIDENCE_UPLOAD,
            actor_id=owner.id,
            target_type="evidence_artifact",
            target_id=evidence.id,
            action="evidence.upload",
            metadata_json={"sha256_digest": digest, "seeded": True},
        )
    )

    # Finding — a harmless, explicitly-synthetic demonstration finding.
    finding = Finding(
        project_id=project.id,
        title=FINDING_TITLE,
        observation=(
            "The synthetic demo target returns `Access-Control-Allow-Origin: *` on all responses."
        ),
        hypothesis=(
            "On a real service, a wildcard ACAO combined with credentialed "
            "requests could allow any origin to read authenticated responses."
        ),
        verification_method="Reviewed the captured response headers (see linked evidence).",
        actual_result="`Access-Control-Allow-Origin: *` present on every response.",
        expected_result="ACAO absent, or restricted to an explicit allowlist of origins.",
        affected_scope=f"http://{DEMO_TARGET}:9000/*",
        security_impact=(
            "None in this demonstration — the target is synthetic and serves no "
            "sensitive data. Recorded to exercise the finding→report pipeline."
        ),
        uncertainty="This is a synthetic finding created for demonstration purposes.",
        severity="info",
        suggested_severity="low",
        cwe_id="CWE-942",
        remediation=(
            "Remove the wildcard `Access-Control-Allow-Origin` header or replace "
            "it with an explicit origin allowlist; never combine `*` with "
            "`Access-Control-Allow-Credentials: true`."
        ),
        disclosure_status="internal",
        state="verified",
        creator_id=owner.id,
        reviewer_id=owner.id,
    )
    db.add(finding)
    db.flush()
    db.add(
        FindingVerification(
            finding_id=finding.id,
            verifier_id=owner.id,
            method="Manual review of captured evidence.",
            result="confirmed",
            notes="Header confirmed present in the captured evidence artifact.",
            evidence_ids=[evidence.id],
        )
    )
    db.add(
        AuditEvent(
            event_type=AuditEventType.FINDING_CREATE,
            actor_id=owner.id,
            target_type="finding",
            target_id=finding.id,
            action="finding.create",
            metadata_json={"severity": "info", "synthetic": True, "seeded": True},
        )
    )
    db.flush()

    # Report — disclosure-style, links the finding, sits in review.
    report = db.execute(
        select(Report).where(Report.project_id == project.id, Report.title == REPORT_TITLE)
    ).scalar_one_or_none()
    if not report:
        report = Report(
            project_id=project.id,
            title=REPORT_TITLE,
            summary=(
                "Baseline HTTP security review of the authorized synthetic target "
                "`demo-target:9000`. One informational, synthetic finding: a "
                "permissive CORS policy. No intrusive testing was performed."
            ),
            affected_asset=f"http://{DEMO_TARGET}:9000",
            scope_confirmation=(
                "Target is in scope for engagement "
                f"'{ENGAGEMENT_NAME}'. Validated by MORPHIA's scope checker at "
                "run approval and again by the worker before execution."
            ),
            prerequisites="None. Unauthenticated HTTP request.",
            reproduction_steps=(
                "1. Send `GET http://demo-target:9000/headers`.\n"
                "2. Observe `Access-Control-Allow-Origin: *` in the response."
            ),
            expected_result="No wildcard CORS header, or an explicit origin allowlist.",
            actual_result="`Access-Control-Allow-Origin: *` returned on every response.",
            impact=(
                "None in this synthetic demonstration. On a real credentialed "
                "service this pattern can enable cross-origin data theft."
            ),
            severity_rationale="Informational — synthetic target, no data at risk.",
            cwe_id="CWE-942",
            remediation=(
                "Remove the wildcard ACAO header or restrict it to an explicit "
                "allowlist; never pair `*` with credentialed CORS."
            ),
            limitations=(
                "This report was generated by MORPHIA against a synthetic target "
                "for demonstration. It is not a real disclosure."
            ),
            disclosure_timeline=[
                {
                    "date": now.date().isoformat(),
                    "event": "Finding identified during authorized run",
                },
                {
                    "date": now.date().isoformat(),
                    "event": "Finding verified against captured evidence",
                },
            ],
            status="review",
            format="markdown",
            creator_id=owner.id,
        )
        db.add(report)
        db.flush()
        db.add(ReportFinding(report_id=report.id, finding_id=finding.id))
        db.add(
            AuditEvent(
                event_type=AuditEventType.REPORT_GENERATE,
                actor_id=owner.id,
                target_type="report",
                target_id=report.id,
                action="report.create",
                metadata_json={"seeded": True},
            )
        )
        db.flush()

    print(f"[seed] created completed run + evidence + finding + report: {RUN_TITLE}")
    return run


def _seed_awaiting_run(
    db: SyncSession, project: Project, engagement: Engagement, owner: User
) -> Run:
    existing = db.execute(
        select(Run).where(Run.project_id == project.id, Run.title == RUN_TITLE_AWAITING)
    ).scalar_one_or_none()
    if existing:
        print(f"[seed] awaiting run exists: {RUN_TITLE_AWAITING}")
        return existing
    plan = {
        "steps": [
            {
                "action": "http_security_headers_audit",
                "target": DEMO_TARGET,
                "prompt": "Audit the security headers of the authorized synthetic target demo-target:9000. Check for missing HSTS, CSP, and related hardening headers. Passive only.",
            }
        ]
    }
    run = Run(
        project_id=project.id,
        engagement_id=engagement.id,
        title=RUN_TITLE_AWAITING,
        agent_profile="passive_recon",
        plan=plan,
        state=RunState.AWAITING_PLAN_APPROVAL,
        created_by=owner.id,
    )
    db.add(run)
    db.flush()
    now = datetime.now(UTC) + timedelta(seconds=10)
    for i, (etype, frm, to, actor, payload) in enumerate(
        [
            ("run.created", None, "DRAFT", owner.id, None),
            ("run.transition", "DRAFT", "PLANNING", owner.id, None),
            ("run.transition", "PLANNING", "AWAITING_PLAN_APPROVAL", owner.id, None),
        ]
    ):
        db.add(
            RunEvent(
                run_id=run.id,
                event_type=etype,
                from_state=frm,
                to_state=to,
                actor_id=actor,
                payload=payload,
                created_at=now + timedelta(seconds=i),
            )
        )
    db.flush()
    print(f"[seed] created awaiting-approval run: {RUN_TITLE_AWAITING}")
    return run


def _seed_failed_run(db: SyncSession, project: Project, engagement: Engagement, owner: User) -> Run:
    existing = db.execute(
        select(Run).where(Run.project_id == project.id, Run.title == RUN_TITLE_FAILED)
    ).scalar_one_or_none()
    if existing:
        print(f"[seed] failed run exists: {RUN_TITLE_FAILED}")
        return existing
    plan = {
        "steps": [
            {
                "action": "http_header_review",
                "target": "production.example.com",
                "prompt": "Attempt to review production.example.com — expected to be blocked by scope policy.",
            }
        ]
    }
    run = Run(
        project_id=project.id,
        engagement_id=engagement.id,
        title=RUN_TITLE_FAILED,
        agent_profile="passive_recon",
        plan=plan,
        state=RunState.FAILED,
        created_by=owner.id,
        failure_reason="Scope validation failed: target 'production.example.com' is explicitly excluded by scope rule 'production.example.com' (exclude). Execution prevented.",
    )
    db.add(run)
    db.flush()
    now = datetime.now(UTC) + timedelta(seconds=20)
    for i, (etype, frm, to, actor, payload) in enumerate(
        [
            ("run.created", None, "DRAFT", owner.id, None),
            ("run.transition", "DRAFT", "PLANNING", owner.id, None),
            ("run.transition", "PLANNING", "AWAITING_PLAN_APPROVAL", owner.id, None),
            (
                "approval.decide",
                "AWAITING_PLAN_APPROVAL",
                "QUEUED",
                owner.id,
                {
                    "decision": "approved",
                    "justification": "Approved for demo denial path — will be blocked by worker revalidation.",
                },
            ),
            ("run.claimed", "QUEUED", "FAILED", "worker:seed", None),
            (
                "run.scope_denied",
                None,
                None,
                "worker:seed",
                {
                    "reason": "target 'production.example.com' is explicitly excluded",
                    "target": "production.example.com",
                },
            ),
        ]
    ):
        db.add(
            RunEvent(
                run_id=run.id,
                event_type=etype,
                from_state=frm,
                to_state=to,
                actor_id=actor,
                payload=payload,
                created_at=now + timedelta(seconds=i),
            )
        )
    db.flush()
    print(f"[seed] created failed (blocked) run: {RUN_TITLE_FAILED}")
    return run


def main() -> None:
    settings = get_settings()
    if settings.is_production:
        print("[seed] Refusing to seed in production. Aborting.", file=sys.stderr)
        sys.exit(1)
    if not ADMIN_PASSWORD:
        print(
            "[seed] SEED_ADMIN_PASSWORD must be set explicitly; refusing to create "
            "a known-password account.",
            file=sys.stderr,
        )
        sys.exit(1)

    session_factory = get_sync_session_factory()
    with session_factory() as db:
        try:
            owner = _get_or_create_user(db, ADMIN_EMAIL, ADMIN_DISPLAY_NAME, "owner")
            project = _get_or_create_project(db, owner)
            engagement = _get_or_create_engagement(db, project, owner)
            _seed_scope_rules(db, engagement, owner)
            _seed_completed_run(db, project, engagement, owner)
            _seed_awaiting_run(db, project, engagement, owner)
            _seed_failed_run(db, project, engagement, owner)
            db.commit()
            print("[seed] Seed complete.")
            print(f"[seed]   sign in at http://localhost:5173  as  {ADMIN_EMAIL}")
        except Exception:
            db.rollback()
            raise


if __name__ == "__main__":
    main()
