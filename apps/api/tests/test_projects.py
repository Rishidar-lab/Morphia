"""Project route tests: create, list, get, ownership enforcement."""

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import User

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


async def _register_and_login(client: AsyncClient, email: str) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Project Test User"},
    )
    login_resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert login_resp.status_code == 200


@pytest.mark.asyncio
async def test_create_project(client: AsyncClient):
    await _register_and_login(client, "project-owner-1@example.com")

    response = await client.post(
        "/api/v1/projects/", json={"name": "Test Project", "description": "A test project."}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Project"
    assert data["status"] == "active"


@pytest.mark.asyncio
async def test_list_projects_only_shows_owned(client: AsyncClient):
    await _register_and_login(client, "project-owner-2@example.com")
    await client.post("/api/v1/projects/", json={"name": "Owner Two Project", "description": ""})

    list_resp = await client.get("/api/v1/projects/")
    assert list_resp.status_code == 200
    names = [p["name"] for p in list_resp.json()]
    assert "Owner Two Project" in names

    # A second, distinct user should not see the first user's project.
    other_client_transport = ASGITransport(app=app)
    async with AsyncClient(transport=other_client_transport, base_url="http://test") as other_client:
        await _register_and_login(other_client, "project-owner-3@example.com")
        other_list = await other_client.get("/api/v1/projects/")
        assert other_list.status_code == 200
        other_names = [p["name"] for p in other_list.json()]
        assert "Owner Two Project" not in other_names


@pytest.mark.asyncio
async def test_get_project_by_id(client: AsyncClient):
    await _register_and_login(client, "project-owner-4@example.com")
    create_resp = await client.post(
        "/api/v1/projects/", json={"name": "Fetchable Project", "description": ""}
    )
    project_id = create_resp.json()["id"]

    get_resp = await client.get(f"/api/v1/projects/{project_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == project_id


@pytest.mark.asyncio
async def test_403_when_accessing_another_users_project(client: AsyncClient):
    await _register_and_login(client, "project-owner-5@example.com")
    create_resp = await client.post(
        "/api/v1/projects/", json={"name": "Private Project", "description": ""}
    )
    project_id = create_resp.json()["id"]

    other_client_transport = ASGITransport(app=app)
    async with AsyncClient(transport=other_client_transport, base_url="http://test") as other_client:
        await _register_and_login(other_client, "project-owner-6@example.com")
        forbidden_resp = await other_client.get(f"/api/v1/projects/{project_id}")
        assert forbidden_resp.status_code == 403


@pytest.mark.asyncio
async def test_404_for_nonexistent_project(client: AsyncClient):
    await _register_and_login(client, "project-owner-7@example.com")

    response = await client.get("/api/v1/projects/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
