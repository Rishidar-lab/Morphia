"""Finding route tests: creation, lifecycle transitions, severity validation, verification."""

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import User
from app.models.findings import Finding, FindingVerification
from app.models.reports import Report, ReportFinding

PASSWORD = "correct-horse-battery"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    async with async_session_factory() as db:
        for model in (ReportFinding, Report, FindingVerification, Finding):
            result = await db.execute(select(model))
            for row in result.scalars().all():
                await db.delete(row)
        await db.flush()

        result = await db.execute(select(User).where(User.email.like("%@example.com")))
        for user in result.scalars().all():
            await db.delete(user)
        await db.commit()


async def _register_and_login(client: AsyncClient, email: str) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Findings Test User"},
    )
    login_resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login_resp.status_code == 200
    client.headers["X-CSRF-Token"] = login_resp.json()["csrfToken"]


async def _create_project(client: AsyncClient, name: str) -> str:
    resp = await client.post("/api/v1/projects/", json={"name": name, "description": ""})
    assert resp.status_code == 201
    return resp.json()["id"]


def _base_finding_payload(**overrides: object) -> dict:
    payload = {
        "title": "Reflected XSS in search parameter",
        "observation": "The `q` parameter is reflected unescaped in the response body.",
        "hypothesis": "User-controlled input is not encoded before being written to HTML context.",
        "verification_method": "Submitted a payload containing a unique marker string via the q parameter.",
        "expected_result": "Marker string should be HTML-encoded in the response.",
        "actual_result": "Marker string was reflected verbatim, executing as script.",
        "affected_scope": "https://app.example.com/search",
        "security_impact": "An attacker could execute arbitrary JavaScript in a victim's session.",
        "uncertainty": "Not yet tested across all supported browsers.",
        "severity": "high",
        "remediation": "Context-aware output encoding on the q parameter.",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_create_finding(client: AsyncClient):
    await _register_and_login(client, "finding-create@example.com")
    project_id = await _create_project(client, "Finding Create Project")

    response = await client.post(
        f"/api/v1/projects/{project_id}/findings", json=_base_finding_payload()
    )
    assert response.status_code == 201
    data = response.json()
    assert data["project_id"] == project_id
    assert data["title"] == "Reflected XSS in search parameter"
    assert data["severity"] == "high"
    assert data["state"] == "candidate"


@pytest.mark.asyncio
async def test_get_finding_by_id(client: AsyncClient):
    await _register_and_login(client, "finding-get@example.com")
    project_id = await _create_project(client, "Finding Get Project")

    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/findings", json=_base_finding_payload()
    )
    finding_id = create_resp.json()["id"]

    get_resp = await client.get(f"/api/v1/findings/{finding_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == finding_id


@pytest.mark.asyncio
async def test_list_findings_filter_by_state_and_severity(client: AsyncClient):
    await _register_and_login(client, "finding-list@example.com")
    project_id = await _create_project(client, "Finding List Project")

    await client.post(
        f"/api/v1/projects/{project_id}/findings",
        json=_base_finding_payload(title="High severity finding", severity="high"),
    )
    await client.post(
        f"/api/v1/projects/{project_id}/findings",
        json=_base_finding_payload(title="Low severity finding", severity="low"),
    )

    all_resp = await client.get(f"/api/v1/projects/{project_id}/findings")
    assert all_resp.status_code == 200
    assert len(all_resp.json()) == 2

    severity_resp = await client.get(
        f"/api/v1/projects/{project_id}/findings", params={"severity": "low"}
    )
    assert severity_resp.status_code == 200
    assert len(severity_resp.json()) == 1
    assert severity_resp.json()[0]["title"] == "Low severity finding"

    state_resp = await client.get(
        f"/api/v1/projects/{project_id}/findings", params={"state": "candidate"}
    )
    assert state_resp.status_code == 200
    assert len(state_resp.json()) == 2

    state_none_resp = await client.get(
        f"/api/v1/projects/{project_id}/findings", params={"state": "resolved"}
    )
    assert state_none_resp.status_code == 200
    assert len(state_none_resp.json()) == 0


@pytest.mark.asyncio
async def test_severity_validation_rejects_invalid_value(client: AsyncClient):
    await _register_and_login(client, "finding-severity-invalid@example.com")
    project_id = await _create_project(client, "Severity Validation Project")

    response = await client.post(
        f"/api/v1/projects/{project_id}/findings",
        json=_base_finding_payload(severity="super-critical"),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_suggested_severity_validation(client: AsyncClient):
    await _register_and_login(client, "finding-suggested-severity@example.com")
    project_id = await _create_project(client, "Suggested Severity Project")

    response = await client.post(
        f"/api/v1/projects/{project_id}/findings",
        json=_base_finding_payload(suggested_severity="not-a-severity"),
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_finding_lifecycle_state_transitions(client: AsyncClient):
    await _register_and_login(client, "finding-lifecycle@example.com")
    project_id = await _create_project(client, "Finding Lifecycle Project")

    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/findings", json=_base_finding_payload()
    )
    finding_id = create_resp.json()["id"]
    assert create_resp.json()["state"] == "candidate"

    needs_evidence_resp = await client.patch(
        f"/api/v1/findings/{finding_id}", json={"state": "needs_evidence"}
    )
    assert needs_evidence_resp.status_code == 200
    assert needs_evidence_resp.json()["state"] == "needs_evidence"

    verified_resp = await client.patch(f"/api/v1/findings/{finding_id}", json={"state": "verified"})
    assert verified_resp.status_code == 200
    assert verified_resp.json()["state"] == "verified"

    report_ready_resp = await client.patch(
        f"/api/v1/findings/{finding_id}", json={"state": "report_ready"}
    )
    assert report_ready_resp.status_code == 200
    assert report_ready_resp.json()["state"] == "report_ready"


@pytest.mark.asyncio
async def test_finding_state_update_rejects_invalid_state(client: AsyncClient):
    await _register_and_login(client, "finding-invalid-state@example.com")
    project_id = await _create_project(client, "Invalid State Project")

    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/findings", json=_base_finding_payload()
    )
    finding_id = create_resp.json()["id"]

    resp = await client.patch(f"/api/v1/findings/{finding_id}", json={"state": "not_a_real_state"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_verification_creates_record(client: AsyncClient):
    await _register_and_login(client, "finding-verify@example.com")
    project_id = await _create_project(client, "Finding Verify Project")

    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/findings", json=_base_finding_payload()
    )
    finding_id = create_resp.json()["id"]

    verify_resp = await client.post(
        f"/api/v1/findings/{finding_id}/verify",
        json={
            "method": "Manually reproduced payload in a fresh browser session.",
            "result": "confirmed",
            "notes": "Payload executed as expected.",
            "evidence_ids": ["some-evidence-id-1", "some-evidence-id-2"],
        },
    )
    assert verify_resp.status_code == 201
    data = verify_resp.json()
    assert data["finding_id"] == finding_id
    assert data["result"] == "confirmed"
    assert data["evidence_ids"] == ["some-evidence-id-1", "some-evidence-id-2"]

    # Confirming a verification should move the finding to the verified state.
    get_resp = await client.get(f"/api/v1/findings/{finding_id}")
    assert get_resp.json()["state"] == "verified"


@pytest.mark.asyncio
async def test_verification_denied_result_rejects_finding(client: AsyncClient):
    await _register_and_login(client, "finding-verify-denied@example.com")
    project_id = await _create_project(client, "Finding Verify Denied Project")

    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/findings", json=_base_finding_payload()
    )
    finding_id = create_resp.json()["id"]

    verify_resp = await client.post(
        f"/api/v1/findings/{finding_id}/verify",
        json={"method": "Attempted reproduction", "result": "denied", "notes": "Could not reproduce."},
    )
    assert verify_resp.status_code == 201

    get_resp = await client.get(f"/api/v1/findings/{finding_id}")
    assert get_resp.json()["state"] == "rejected"


@pytest.mark.asyncio
async def test_verification_invalid_result_rejected(client: AsyncClient):
    await _register_and_login(client, "finding-verify-invalid-result@example.com")
    project_id = await _create_project(client, "Finding Verify Invalid Result Project")

    create_resp = await client.post(
        f"/api/v1/projects/{project_id}/findings", json=_base_finding_payload()
    )
    finding_id = create_resp.json()["id"]

    verify_resp = await client.post(
        f"/api/v1/findings/{finding_id}/verify",
        json={"method": "test", "result": "maybe", "notes": ""},
    )
    assert verify_resp.status_code == 422
