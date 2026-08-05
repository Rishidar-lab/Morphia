"""Authentication route tests: register, login, logout, me, session expiry."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import Session, User

TEST_EMAIL = "auth-test-user@example.com"
TEST_PASSWORD = "correct-horse-battery"
TEST_DISPLAY_NAME = "Auth Test User"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    # Cleanup any users created during the test run.
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.email.like("%@example.com")))
        for user in result.scalars().all():
            await db.delete(user)
        await db.commit()


@pytest.mark.asyncio
async def test_register_creates_user(client: AsyncClient):
    response = await client.post(
        "/api/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "display_name": TEST_DISPLAY_NAME},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == TEST_EMAIL
    assert data["display_name"] == TEST_DISPLAY_NAME
    assert "password" not in data
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_register_duplicate_email_rejected(client: AsyncClient):
    payload = {
        "email": "dup-test-user@example.com",
        "password": TEST_PASSWORD,
        "display_name": TEST_DISPLAY_NAME,
    }
    first = await client.post("/api/auth/register", json=payload)
    assert first.status_code == 201

    second = await client.post("/api/auth/register", json=payload)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_login_with_valid_credentials(client: AsyncClient):
    email = "login-test-user@example.com"
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": TEST_PASSWORD, "display_name": TEST_DISPLAY_NAME},
    )

    response = await client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == email
    assert "csrfToken" in data
    assert "sid" in response.cookies


@pytest.mark.asyncio
async def test_login_invalid_credentials_rejected(client: AsyncClient):
    email = "invalid-cred-user@example.com"
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": TEST_PASSWORD, "display_name": TEST_DISPLAY_NAME},
    )

    response = await client.post("/api/auth/login", json={"email": email, "password": "wrong-password"})
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_nonexistent_user_rejected(client: AsyncClient):
    response = await client.post(
        "/api/auth/login", json={"email": "no-such-user@example.com", "password": TEST_PASSWORD}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_authentication(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user_after_login(client: AsyncClient):
    email = "me-test-user@example.com"
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": TEST_PASSWORD, "display_name": TEST_DISPLAY_NAME},
    )
    login_resp = await client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert login_resp.status_code == 200

    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email


@pytest.mark.asyncio
async def test_logout_invalidates_session(client: AsyncClient):
    email = "logout-test-user@example.com"
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": TEST_PASSWORD, "display_name": TEST_DISPLAY_NAME},
    )
    await client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})

    logout_resp = await client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_session_rejected(client: AsyncClient):
    email = "expiry-test-user@example.com"
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": TEST_PASSWORD, "display_name": TEST_DISPLAY_NAME},
    )
    login_resp = await client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert login_resp.status_code == 200

    token = login_resp.cookies["sid"]

    # Force the session to be expired directly in the database.
    async with async_session_factory() as db:
        result = await db.execute(select(Session).where(Session.token == token))
        session = result.scalar_one_or_none()
        assert session is not None
        session.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        await db.commit()

    me_resp = await client.get("/api/auth/me")
    assert me_resp.status_code == 401
