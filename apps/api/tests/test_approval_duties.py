"""Approval separation-of-duties controls.

Single-owner MVP constraint: only the project owner can reach the approve /
reject endpoints, so a distinct human approver cannot exist yet (full
blocking would deadlock every approval). The compatible enforced control is:

  - self-approval requires a written justification (>= 10 chars), else 422
  - every decision records `self_approved` in the run timeline + audit trail
  - rejection always requires a written justification, else 422
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import User
from app.models.runs import RunEvent

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
        json={"email": email, "password": PASSWORD, "display_name": "Duties E2E"},
    )
    resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200
    client.headers["X-CSRF-Token"] = resp.json()["csrfToken"]


async def _awaiting_run(client: AsyncClient) -> str:
    pid = (await client.post("/api/v1/projects", json={"name": "Duties"})).json()["id"]
    eid = (
        await client.post(
            f"/api/v1/projects/{pid}/engagements",
            json={"program_name": "Local", "authorization_basis": "synthetic"},
        )
    ).json()["id"]
    await client.post(
        f"/api/v1/engagements/{eid}/scope",
        json={
            "rule_type": "include",
            "target_type": "domain",
            "pattern": "demo-target",
            "is_wildcard": False,
        },
    )
    run_id = (
        await client.post(
            f"/api/v1/projects/{pid}/runs",
            json={
                "title": "duties probe",
                "engagement_id": eid,
                "plan": {
                    "steps": [{"action": "http_probe", "target": "demo-target", "prompt": "x"}]
                },
            },
        )
    ).json()["id"]
    for state in ("PLANNING", "AWAITING_PLAN_APPROVAL"):
        r = await client.post(f"/api/v1/runs/{run_id}/transition", json={"target_state": state})
        assert r.status_code == 200
    return run_id


@pytest.mark.asyncio
async def test_self_approval_without_justification_is_rejected(client: AsyncClient):
    await _auth(client, "duties-nj@example.com")
    run_id = await _awaiting_run(client)
    r = await client.post(f"/api/v1/runs/{run_id}/approve", json={"justification": ""})
    assert r.status_code == 422
    r = await client.post(f"/api/v1/runs/{run_id}/approve", json={"justification": "short"})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_self_approval_with_justification_is_flagged(client: AsyncClient):
    await _auth(client, "duties-ok@example.com")
    run_id = await _awaiting_run(client)
    r = await client.post(
        f"/api/v1/runs/{run_id}/approve",
        json={"justification": "reviewed plan against authorized scope"},
    )
    assert r.status_code == 200
    assert r.json()["state"] == "QUEUED"
    events = (await client.get(f"/api/v1/runs/{run_id}/events")).json()
    decisions = [e for e in events if e["event_type"] == "approval.decide"]
    assert len(decisions) == 1
    assert decisions[0]["payload"]["self_approved"] is True


@pytest.mark.asyncio
async def test_reject_requires_justification(client: AsyncClient):
    await _auth(client, "duties-rj@example.com")
    run_id = await _awaiting_run(client)
    r = await client.post(f"/api/v1/runs/{run_id}/reject", json={"justification": ""})
    assert r.status_code == 422
    r = await client.post(
        f"/api/v1/runs/{run_id}/reject",
        json={"justification": "plan targets unapproved surface area"},
    )
    assert r.status_code == 200
    assert r.json()["state"] == "CANCELLED"


@pytest.mark.asyncio
async def test_self_approval_flag_recorded_on_event_row(client: AsyncClient):
    await _auth(client, "duties-ev@example.com")
    run_id = await _awaiting_run(client)
    await client.post(
        f"/api/v1/runs/{run_id}/approve",
        json={"justification": "flag persistence check justification"},
    )
    async with async_session_factory() as db:
        result = await db.execute(select(RunEvent).where(RunEvent.run_id == run_id))
        payloads = [e.payload for e in result.scalars().all() if e.event_type == "approval.decide"]
    assert payloads and payloads[0]["self_approved"] is True
