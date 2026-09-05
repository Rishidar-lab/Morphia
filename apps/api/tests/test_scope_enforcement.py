"""Scope enforcement, end to end through the real HTTP + worker-callback API.

This is MORPHIA's most important product proof (docs/security.md §2 —
"scope enforcement is the primary security boundary"):

  CASE A  in-scope target  -> the worker can claim the step, run proceeds
  CASE B  out-of-scope target -> the worker's claim is refused (403) and the
          run is transitioned to FAILED with the reason recorded, durably
          (committed before the error so get_db()'s rollback can't lose it).

The worker's checkpoint is the `POST /api/worker/runs/{id}/claim` endpoint —
it re-runs the full ScopeValidator against the specific step target,
independent of the API-side check done at approval time.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import User
from app.models.runs import Run

PASSWORD = "correct-horse-battery"
WORKER_HEADERS = {"X-Worker-Auth": "test-only-worker-secret"}


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
        json={"email": email, "password": PASSWORD, "display_name": "Scope E2E"},
    )
    resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200
    client.headers["X-CSRF-Token"] = resp.json()["csrfToken"]


async def _workspace(client: AsyncClient) -> tuple[str, str]:
    """Create project + active engagement + one include rule for `demo-target`.
    Returns (project_id, engagement_id)."""
    pid = (await client.post("/api/v1/projects", json={"name": "Scope E2E"})).json()["id"]
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
            "target_type": "domain",
            "pattern": "demo-target",
            "is_wildcard": False,
        },
    )
    assert r.status_code == 201
    return pid, eid


async def _approved_run(
    client: AsyncClient, pid: str, eid: str, target: str, *, tool: str | None = None
) -> str:
    step: dict = {"action": "http_probe", "target": target, "prompt": "x"}
    if tool:
        step["tool"] = tool
    run_id = (
        await client.post(
            f"/api/v1/projects/{pid}/runs",
            json={
                "title": f"probe {target}",
                "engagement_id": eid,
                "plan": {"steps": [step]},
            },
        )
    ).json()["id"]
    for state in ("PLANNING", "AWAITING_PLAN_APPROVAL"):
        assert (
            await client.post(f"/api/v1/runs/{run_id}/transition", json={"target_state": state})
        ).status_code == 200
    assert (
        await client.post(
            f"/api/v1/runs/{run_id}/approve",
            json={"justification": "scope proof approval: synthetic target review"},
        )
    ).status_code == 200
    return run_id


@pytest.mark.asyncio
async def test_case_a_in_scope_target_is_claimable(client: AsyncClient):
    await _auth(client, "scope-allow@example.com")
    pid, eid = await _workspace(client)
    run_id = await _approved_run(client, pid, eid, "demo-target")

    resp = await client.post(
        f"/api/worker/runs/{run_id}/claim",
        json={"worker_id": "test-worker"},
        headers=WORKER_HEADERS,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["done"] is False
    assert body["target"] == "demo-target"
    assert body["step_number"] == 1

    async with async_session_factory() as db:
        run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
        assert run.state.value == "RUNNING"


@pytest.mark.asyncio
async def test_case_b_out_of_scope_target_is_refused_and_run_fails(client: AsyncClient):
    await _auth(client, "scope-deny@example.com")
    pid, eid = await _workspace(client)
    run_id = await _approved_run(client, pid, eid, "production.example.com")

    resp = await client.post(
        f"/api/worker/runs/{run_id}/claim",
        json={"worker_id": "test-worker"},
        headers=WORKER_HEADERS,
    )
    assert resp.status_code == 403
    assert "does not match any allowed scope rule" in resp.json()["detail"].lower()

    # The FAILED transition must be durable, not rolled back by the raised error.
    async with async_session_factory() as db:
        run = (await db.execute(select(Run).where(Run.id == run_id))).scalar_one()
        assert run.state.value == "FAILED"
        assert "scope denied" in run.failure_reason.lower()


@pytest.mark.asyncio
async def test_worker_claim_requires_the_shared_secret(client: AsyncClient):
    await _auth(client, "scope-noauth@example.com")
    pid, eid = await _workspace(client)
    run_id = await _approved_run(client, pid, eid, "demo-target")

    resp = await client.post(f"/api/worker/runs/{run_id}/claim", json={"worker_id": "attacker"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_tool_backed_step_passes_through_and_is_still_scope_checked(client: AsyncClient):
    """A `tool`-tagged plan step must go through the exact same claim path
    and 8-point scope validator as an LLM step — no separate, unchecked
    dispatch route for tool execution."""
    await _auth(client, "scope-tool-allow@example.com")
    pid, eid = await _workspace(client)
    run_id = await _approved_run(client, pid, eid, "demo-target", tool="httpx")

    resp = await client.post(
        f"/api/worker/runs/{run_id}/claim",
        json={"worker_id": "test-worker"},
        headers=WORKER_HEADERS,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tool"] == "httpx"
    assert body["target"] == "demo-target"


@pytest.mark.asyncio
async def test_tool_backed_step_out_of_scope_is_still_refused(client: AsyncClient):
    await _auth(client, "scope-tool-deny@example.com")
    pid, eid = await _workspace(client)
    run_id = await _approved_run(client, pid, eid, "production.example.com", tool="httpx")

    resp = await client.post(
        f"/api/worker/runs/{run_id}/claim",
        json={"worker_id": "test-worker"},
        headers=WORKER_HEADERS,
    )
    assert resp.status_code == 403
    assert "does not match any allowed scope rule" in resp.json()["detail"].lower()
