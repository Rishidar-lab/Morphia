"""Development seed script.

Usage:
    python -m app.seed

Creates a default admin user, a sample project, engagement, and a couple
of scope rules for local development. Idempotent — running it multiple
times will not create duplicate records.

Uses a synchronous database connection (DATABASE_URL_SYNC) since this is
a one-shot CLI script, not part of the async request path.
"""

import sys

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session as SyncSession, sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.auth import User
from app.models.domain import Engagement, Project, ScopeRule

ADMIN_EMAIL = "admin@morphia.local"
ADMIN_PASSWORD = "morphia-dev-2026"
ADMIN_DISPLAY_NAME = "MORPHIA Admin"

SAMPLE_PROJECT_NAME = "Sample Security Assessment"
SAMPLE_ENGAGEMENT_NAME = "Q1 External Pentest"


def get_sync_session_factory() -> sessionmaker[SyncSession]:
    settings = get_settings()
    sync_url = settings.database_url_sync or settings.database_url.replace(
        "postgresql+asyncpg://", "postgresql://"
    )
    engine = create_engine(sync_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, class_=SyncSession, expire_on_commit=False)


def seed_admin_user(db: SyncSession) -> User:
    existing = db.execute(select(User).where(User.email == ADMIN_EMAIL)).scalar_one_or_none()
    if existing:
        print(f"[seed] Admin user already exists: {ADMIN_EMAIL}")
        return existing

    user = User(
        email=ADMIN_EMAIL,
        password_hash=hash_password(ADMIN_PASSWORD),
        display_name=ADMIN_DISPLAY_NAME,
        role="owner",
        is_active=True,
    )
    db.add(user)
    db.flush()
    print(f"[seed] Created admin user: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    return user


def seed_sample_project(db: SyncSession, owner: User) -> Project:
    existing = db.execute(
        select(Project).where(Project.name == SAMPLE_PROJECT_NAME, Project.owner_id == owner.id)
    ).scalar_one_or_none()
    if existing:
        print(f"[seed] Sample project already exists: {SAMPLE_PROJECT_NAME}")
        return existing

    project = Project(
        name=SAMPLE_PROJECT_NAME,
        description="Seeded sample project for local development.",
        status="active",
        owner_id=owner.id,
    )
    db.add(project)
    db.flush()
    print(f"[seed] Created sample project: {SAMPLE_PROJECT_NAME}")
    return project


def seed_sample_engagement(db: SyncSession, project: Project) -> Engagement:
    existing = db.execute(
        select(Engagement).where(
            Engagement.project_id == project.id,
            Engagement.program_name == SAMPLE_ENGAGEMENT_NAME,
        )
    ).scalar_one_or_none()
    if existing:
        print(f"[seed] Sample engagement already exists: {SAMPLE_ENGAGEMENT_NAME}")
        return existing

    engagement = Engagement(
        project_id=project.id,
        program_name=SAMPLE_ENGAGEMENT_NAME,
        authorization_basis="Signed statement of work on file (seeded placeholder).",
        status="active",
        notes="Seeded sample engagement for local development.",
    )
    db.add(engagement)
    db.flush()
    print(f"[seed] Created sample engagement: {SAMPLE_ENGAGEMENT_NAME}")
    return engagement


def seed_sample_scope_rules(db: SyncSession, engagement: Engagement) -> None:
    existing = db.execute(
        select(ScopeRule).where(ScopeRule.engagement_id == engagement.id)
    ).scalars().all()
    if existing:
        print(f"[seed] Scope rules already exist for engagement {engagement.id}")
        return

    rules = [
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="include",
            target_type="domain",
            pattern="*.example-corp.test",
            is_wildcard=True,
            notes="Primary in-scope domain (seeded).",
        ),
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="include",
            target_type="ip",
            pattern="10.10.0.0/24",
            is_wildcard=False,
            notes="Primary in-scope network range (seeded).",
        ),
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="exclude",
            target_type="domain",
            pattern="billing.example-corp.test",
            is_wildcard=False,
            notes="Third-party billing system, out of scope (seeded).",
        ),
    ]
    db.add_all(rules)
    db.flush()
    print(f"[seed] Created {len(rules)} scope rules for engagement {engagement.id}")


def main() -> None:
    settings = get_settings()
    if settings.is_production:
        print("[seed] Refusing to seed in production environment. Aborting.", file=sys.stderr)
        sys.exit(1)

    session_factory = get_sync_session_factory()
    with session_factory() as db:
        try:
            admin = seed_admin_user(db)
            project = seed_sample_project(db, admin)
            engagement = seed_sample_engagement(db, project)
            seed_sample_scope_rules(db, engagement)
            db.commit()
            print("[seed] Seed complete.")
        except Exception:
            db.rollback()
            raise


if __name__ == "__main__":
    main()
