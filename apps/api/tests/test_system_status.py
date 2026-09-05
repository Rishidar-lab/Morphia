"""System status, security headers, and production config tests."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.config import Settings
from app.main import app
from app.models.auth import User

PASSWORD = "correct-horse-battery"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    from app.core.database import async_session_factory

    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.email.like("%@example.com")))
        for user in result.scalars().all():
            await db.delete(user)
        await db.commit()


async def _auth(client: AsyncClient, email: str) -> None:
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "System E2E"},
    )
    resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200
    client.headers["X-CSRF-Token"] = resp.json()["csrfToken"]


@pytest.mark.asyncio
async def test_system_status_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/system/status")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_system_status_returns_safe_payload(client: AsyncClient):
    await _auth(client, "system-status@example.com")
    r = await client.get("/api/v1/system/status")
    assert r.status_code == 200
    body = r.json()
    for field in (
        "version",
        "environment",
        "provider",
        "storage_backend",
        "database",
        "redis",
        "worker",
        "migration",
    ):
        assert field in body, field
    blob = str(body).lower()
    for secret_word in ("secret", "password", "api_key", "apikey", "token"):
        assert secret_word not in blob, secret_word
    assert body["database"]["status"] in ("ok", "degraded")


@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("Referrer-Policy") == "same-origin"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert "X-Request-ID" in r.headers


class TestProductionConfigValidation:
    def _base_env(self, monkeypatch, **overrides):
        env = {
            "ENVIRONMENT": "production",
            "SECRET_KEY": "a" * 64,
            "DATABASE_URL": "postgresql+asyncpg://u:p@localhost/db",
            "WORKER_AUTH_SECRET": "b" * 32,
            "DEBUG": "false",
        }
        env.update(overrides)
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        monkeypatch.delenv("ENABLE_E2E_AUTH_OVERRIDE", raising=False)

    def test_valid_production_config_passes(self, monkeypatch):
        self._base_env(monkeypatch)
        assert Settings().environment == "production"  # type: ignore[call-arg]

    def test_placeholder_secret_rejected(self, monkeypatch):
        self._base_env(monkeypatch, SECRET_KEY="change-me-to-a-random-64-char-string")
        with pytest.raises(Exception, match="SECRET_KEY"):
            Settings()  # type: ignore[call-arg]

    def test_short_worker_secret_rejected(self, monkeypatch):
        self._base_env(monkeypatch, WORKER_AUTH_SECRET="short")
        with pytest.raises(Exception, match="WORKER_AUTH_SECRET"):
            Settings()  # type: ignore[call-arg]

    def test_debug_in_production_rejected(self, monkeypatch):
        self._base_env(monkeypatch, DEBUG="true")
        with pytest.raises(Exception, match="DEBUG"):
            Settings()  # type: ignore[call-arg]

    def test_dev_placeholders_still_boot(self, monkeypatch):
        monkeypatch.setenv("ENVIRONMENT", "development")
        monkeypatch.setenv("SECRET_KEY", "change-me-dev")
        monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
        Settings()  # type: ignore[call-arg]
