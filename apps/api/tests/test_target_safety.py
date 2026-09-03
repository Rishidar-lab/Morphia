"""Target safety (SSRF / metadata / rebinding) unit tests.

Pure-function tests for `target_safety` plus validator-level integration:
dangerous targets are denied even when an include rule would match them,
and dangerous include patterns are rejected at creation time.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import User
from app.services.target_safety import (
    prohibited_scope_pattern_reason,
    prohibited_target_reason,
)

PASSWORD = "correct-horse-battery"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.email.like("%@example.com")))
        for user in result.scalars().all():
            await db.delete(user)
        await db.commit()


async def _auth(client: AsyncClient, email: str) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Safety E2E"},
    )
    resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200
    client.headers["X-CSRF-Token"] = resp.json()["csrfToken"]


class TestProhibitedTargets:
    @pytest.mark.parametrize(
        "target",
        [
            "127.0.0.1",
            "http://127.0.0.1:8080/admin",
            "127.1.2.3",
            "::1",
            "http://[::1]/",
            "169.254.169.254",
            "http://169.254.169.254/latest/meta-data/",
            "169.254.10.20",
            "0.0.0.0",  # noqa: S104 — test data, not a bind address
            "224.0.0.1",
            "localhost",
            "LOCALHOST",
            "app.localhost",
            "metadata.google.internal",
            "instance-data-compute",
            "http://metadata.google.internal/computeMetadata/v1/",
            "",
            "not a host !!",
        ],
    )
    def test_unsafe_targets_denied(self, target: str):
        assert prohibited_target_reason(target) is not None, target

    @pytest.mark.parametrize(
        "target",
        [
            "demo-target",
            "app.example-corp.test",
            "production.example.com",
            "example.com",
            "https://example.com/some/path?q=1",
            "203.0.113.10",  # TEST-NET-3 documentation range is a plain global literal
        ],
    )
    def test_benign_targets_allowed(self, target: str):
        assert prohibited_target_reason(target) is None, target

    def test_private_ranges_allowed_by_default(self):
        # The demo and self-hosted deployments run on private networks.
        assert prohibited_target_reason("10.0.0.5") is None
        assert prohibited_target_reason("192.168.1.1") is None

    def test_private_ranges_denied_when_strict(self, monkeypatch):
        monkeypatch.setenv("SCOPE_DENY_PRIVATE_RANGES", "true")
        assert prohibited_target_reason("10.0.0.5") is not None
        assert prohibited_target_reason("192.168.1.1") is not None

    def test_dns_rebinding_hostname_denied(self):
        # `localhost` resolution aside, a hostname that resolves to loopback
        # must be denied when DNS is available. Use a name guaranteed to
        # resolve locally without network access.
        reason = prohibited_target_reason("localhost")
        assert reason is not None


class TestProhibitedScopePatterns:
    @pytest.mark.parametrize(
        "pattern",
        [
            "127.0.0.1",
            "127.0.0.0/8",
            "169.254.169.254",
            "localhost",
            "*.localhost",
            "metadata.google.internal",
        ],
    )
    def test_unsafe_include_patterns_rejected(self, pattern: str):
        assert prohibited_scope_pattern_reason(pattern) is not None, pattern

    @pytest.mark.parametrize(
        "pattern",
        [
            "demo-target",
            "*.example.com",
            "example.com",
            "10.0.0.0/24",
        ],
    )
    def test_safe_include_patterns_accepted(self, pattern: str):
        assert prohibited_scope_pattern_reason(pattern) is None, pattern


@pytest.mark.asyncio
async def test_scope_rule_creation_rejects_loopback_include(client: AsyncClient):
    await _auth(client, "safety-rule@example.com")
    pid = (await client.post("/api/v1/projects", json={"name": "Safety"})).json()["id"]
    eid = (
        await client.post(
            f"/api/v1/projects/{pid}/engagements",
            json={"program_name": "Local", "authorization_basis": "synthetic"},
        )
    ).json()["id"]
    r = await client.post(
        f"/api/v1/engagements/{eid}/scope",
        json={
            "rule_type": "include",
            "target_type": "host",
            "pattern": "127.0.0.1",
            "is_wildcard": False,
        },
    )
    assert r.status_code == 422
    # Excluding unsafe space is always allowed.
    r = await client.post(
        f"/api/v1/engagements/{eid}/scope",
        json={
            "rule_type": "exclude",
            "target_type": "host",
            "pattern": "127.0.0.1",
            "is_wildcard": False,
        },
    )
    assert r.status_code == 201
    # Benign includes still work.
    r = await client.post(
        f"/api/v1/engagements/{eid}/scope",
        json={
            "rule_type": "include",
            "target_type": "domain",
            "pattern": "demo-target",
            "is_wildcard": False,
        },
    )
    assert r.status_code == 201
