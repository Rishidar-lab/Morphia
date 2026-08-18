"""Tests for the ScopeValidator 8-point check service.

Uses the async database session directly (not the HTTP client) since the
validator is a service-layer component, and creates its own fixtures for
a User, Project, Engagement, and ScopeRules per test.
"""

import pytest

from app.core.database import async_session_factory
from app.core.security import hash_password
from app.models.auth import User
from app.models.domain import Engagement, Project, ScopeRule
from app.services.scope_validator import ScopeValidator


@pytest.fixture
async def db_session():
    async with async_session_factory() as session:
        yield session
        await session.rollback()


async def _make_engagement(
    db, *, engagement_status: str = "active", email_suffix: str = "default"
) -> Engagement:
    user = User(
        email=f"scope-test-{email_suffix}@example.com",
        password_hash=hash_password("irrelevant-password"),
        display_name="Scope Test User",
    )
    db.add(user)
    await db.flush()

    project = Project(name=f"Scope Test Project {email_suffix}", owner_id=user.id)
    db.add(project)
    await db.flush()

    engagement = Engagement(
        project_id=project.id,
        program_name=f"Scope Test Engagement {email_suffix}",
        status=engagement_status,
    )
    db.add(engagement)
    await db.flush()

    return engagement


@pytest.mark.asyncio
async def test_validate_passes_for_in_scope_target(db_session):
    engagement = await _make_engagement(db_session, email_suffix="in-scope")
    db_session.add(
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="include",
            target_type="domain",
            pattern="*.example-corp.test",
            is_wildcard=True,
        )
    )
    await db_session.flush()

    validator = ScopeValidator(db_session)
    result = await validator.validate_target(
        engagement_id=engagement.id,
        target="app.example-corp.test",
        action="recon",
        actor="test-actor",
    )

    assert result.allowed is True
    assert "in_scope" in result.checks_passed
    assert "audit_logged" in result.checks_passed


@pytest.mark.asyncio
async def test_validate_denies_excluded_target(db_session):
    engagement = await _make_engagement(db_session, email_suffix="excluded")
    db_session.add_all(
        [
            ScopeRule(
                engagement_id=engagement.id,
                rule_type="include",
                target_type="domain",
                pattern="*.example-corp.test",
                is_wildcard=True,
            ),
            ScopeRule(
                engagement_id=engagement.id,
                rule_type="exclude",
                target_type="domain",
                pattern="billing.example-corp.test",
            ),
        ]
    )
    await db_session.flush()

    validator = ScopeValidator(db_session)
    result = await validator.validate_target(
        engagement_id=engagement.id,
        target="billing.example-corp.test",
        action="recon",
        actor="test-actor",
    )

    assert result.allowed is False
    assert "exclusion" in result.reason.lower()


@pytest.mark.asyncio
async def test_validate_denies_when_engagement_inactive(db_session):
    engagement = await _make_engagement(
        db_session, engagement_status="closed", email_suffix="inactive"
    )
    db_session.add(
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="include",
            target_type="domain",
            pattern="*.example-corp.test",
            is_wildcard=True,
        )
    )
    await db_session.flush()

    validator = ScopeValidator(db_session)
    result = await validator.validate_target(
        engagement_id=engagement.id,
        target="app.example-corp.test",
        action="recon",
        actor="test-actor",
    )

    assert result.allowed is False
    assert "not active" in result.reason.lower()


@pytest.mark.asyncio
async def test_default_deny_for_unknown_engagement(db_session):
    validator = ScopeValidator(db_session)
    result = await validator.validate_target(
        engagement_id="00000000-0000-0000-0000-000000000000",
        target="app.example-corp.test",
        action="recon",
        actor="test-actor",
    )

    assert result.allowed is False
    assert "not found" in result.reason.lower()


@pytest.mark.asyncio
async def test_default_deny_when_no_scope_rules_defined(db_session):
    engagement = await _make_engagement(db_session, email_suffix="no-rules")
    # No ScopeRule rows created — target should not match any allow rule.

    validator = ScopeValidator(db_session)
    result = await validator.validate_target(
        engagement_id=engagement.id,
        target="anything.example-corp.test",
        action="recon",
        actor="test-actor",
    )

    assert result.allowed is False
    assert "does not match any allowed scope rule" in result.reason.lower()


@pytest.mark.asyncio
async def test_default_deny_when_actor_missing(db_session):
    engagement = await _make_engagement(db_session, email_suffix="no-actor")
    db_session.add(
        ScopeRule(
            engagement_id=engagement.id,
            rule_type="include",
            target_type="domain",
            pattern="*.example-corp.test",
            is_wildcard=True,
        )
    )
    await db_session.flush()

    validator = ScopeValidator(db_session)
    result = await validator.validate_target(
        engagement_id=engagement.id,
        target="app.example-corp.test",
        action="recon",
        actor="",
    )

    assert result.allowed is False
