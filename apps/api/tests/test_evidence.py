"""Evidence artifact route tests: upload, SHA-256 computation, filtering, verification."""

import hashlib

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import User
from app.models.evidence import EvidenceArtifact
from app.models.findings import Finding, FindingVerification
from app.models.reports import Report, ReportFinding

PASSWORD = "correct-horse-battery"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    async with async_session_factory() as db:
        # Delete dependent rows before users to respect FK constraints
        # (mirrors the cleanup style used in test_auth.py / test_projects.py).
        for model in (ReportFinding, Report, FindingVerification, Finding, EvidenceArtifact):
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
        json={"email": email, "password": PASSWORD, "display_name": "Evidence Test User"},
    )
    login_resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login_resp.status_code == 200
    client.headers["X-CSRF-Token"] = login_resp.json()["csrfToken"]


async def _create_project(client: AsyncClient, name: str) -> str:
    resp = await client.post("/api/v1/projects/", json={"name": name, "description": ""})
    assert resp.status_code == 201
    return resp.json()["id"]


async def _set_role(email: str, role: str) -> None:
    """Directly set a user's role in the DB (no admin endpoint exists yet)."""
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.role = role
        await db.commit()


@pytest.mark.asyncio
async def test_upload_evidence(client: AsyncClient):
    await _register_and_login(client, "evidence-upload@example.com")
    project_id = await _create_project(client, "Evidence Upload Project")

    file_bytes = b"\x89PNG\r\n\x1a\n" + b"mock evidence file contents"
    response = await client.post(
        f"/api/v1/projects/{project_id}/evidence",
        files={"file": ("screenshot.png", file_bytes, "image/png")},
        data={"source": "burp_suite", "sensitivity": "standard"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["project_id"] == project_id
    assert data["original_filename"] == "screenshot.png"
    assert data["content_type"] == "image/png"
    assert data["file_size"] == len(file_bytes)
    assert data["verification_status"] == "unreviewed"
    assert data["storage_path"]


@pytest.mark.asyncio
async def test_sha256_is_computed_correctly(client: AsyncClient):
    await _register_and_login(client, "evidence-sha256@example.com")
    project_id = await _create_project(client, "SHA256 Project")

    file_bytes = b"the quick brown fox jumps over the lazy dog"
    expected_digest = hashlib.sha256(file_bytes).hexdigest()

    response = await client.post(
        f"/api/v1/projects/{project_id}/evidence",
        files={"file": ("log.txt", file_bytes, "text/plain")},
        data={"source": "manual"},
    )
    assert response.status_code == 201
    assert response.json()["sha256_digest"] == expected_digest
    assert len(response.json()["sha256_digest"]) == 64


@pytest.mark.asyncio
async def test_list_evidence_with_filter(client: AsyncClient):
    await _register_and_login(client, "evidence-list@example.com")
    project_id = await _create_project(client, "Evidence List Project")

    await client.post(
        f"/api/v1/projects/{project_id}/evidence",
        files={"file": ("a.txt", b"aaa", "text/plain")},
        data={"source": "tool_a"},
    )
    await client.post(
        f"/api/v1/projects/{project_id}/evidence",
        files={"file": ("b.txt", b"bbb", "text/plain")},
        data={"source": "tool_b"},
    )

    list_resp = await client.get(f"/api/v1/projects/{project_id}/evidence")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 2

    filtered_resp = await client.get(
        f"/api/v1/projects/{project_id}/evidence", params={"verification_status": "unreviewed"}
    )
    assert filtered_resp.status_code == 200
    assert len(filtered_resp.json()) == 2

    filtered_none = await client.get(
        f"/api/v1/projects/{project_id}/evidence",
        params={"verification_status": "integrity_verified"},
    )
    assert filtered_none.status_code == 200
    assert len(filtered_none.json()) == 0


@pytest.mark.asyncio
async def test_get_evidence_by_id(client: AsyncClient):
    await _register_and_login(client, "evidence-get@example.com")
    project_id = await _create_project(client, "Evidence Get Project")

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/evidence",
        files={"file": ("c.txt", b"ccc", "text/plain")},
        data={"source": "tool_c"},
    )
    evidence_id = upload_resp.json()["id"]

    get_resp = await client.get(f"/api/v1/evidence/{evidence_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == evidence_id


@pytest.mark.asyncio
async def test_verify_evidence_requires_reviewer_role(client: AsyncClient):
    email = "evidence-verify-researcher@example.com"
    await _register_and_login(client, email)
    project_id = await _create_project(client, "Verify Requires Reviewer Project")

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/evidence",
        files={"file": ("d.txt", b"ddd", "text/plain")},
        data={"source": "tool_d"},
    )
    evidence_id = upload_resp.json()["id"]

    # Default role is "researcher" — should be denied.
    denied_resp = await client.patch(
        f"/api/v1/evidence/{evidence_id}/verify",
        json={"verification_status": "integrity_verified", "notes": "looks good"},
    )
    assert denied_resp.status_code == 403

    # Promote to reviewer and retry.
    await _set_role(email, "reviewer")
    allowed_resp = await client.patch(
        f"/api/v1/evidence/{evidence_id}/verify",
        json={"verification_status": "integrity_verified", "notes": "looks good"},
    )
    assert allowed_resp.status_code == 200
    data = allowed_resp.json()
    assert data["verification_status"] == "integrity_verified"
    assert data["reviewer_id"]


@pytest.mark.asyncio
async def test_verify_evidence_rejects_invalid_status(client: AsyncClient):
    email = "evidence-verify-invalid@example.com"
    await _register_and_login(client, email)
    await _set_role(email, "reviewer")
    project_id = await _create_project(client, "Invalid Status Project")

    upload_resp = await client.post(
        f"/api/v1/projects/{project_id}/evidence",
        files={"file": ("e.txt", b"eee", "text/plain")},
        data={"source": "tool_e"},
    )
    evidence_id = upload_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/evidence/{evidence_id}/verify",
        json={"verification_status": "not_a_real_status"},
    )
    assert resp.status_code == 422
