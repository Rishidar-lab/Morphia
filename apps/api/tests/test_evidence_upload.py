"""Evidence upload validation tests (size, type, filename)."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import async_session_factory
from app.main import app
from app.models.auth import User
from app.services.evidence_upload import (
    UploadValidationError,
    sanitize_filename,
    validate_upload,
)

PASSWORD = "correct-horse-battery"
PNG = b"\x89PNG\r\n\x1a\n" + b"fakepngdata"
JPEG = b"\xff\xd8\xff" + b"fakejpegdata"


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


async def _auth(client: AsyncClient, email: str) -> str:
    await client.post(
        "/api/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": "Upload E2E"},
    )
    resp = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200
    client.headers["X-CSRF-Token"] = resp.json()["csrfToken"]
    return (await client.post("/api/v1/projects", json={"name": "Upload"})).json()["id"]


class TestValidateUploadUnit:
    def test_png_passes(self):
        name, ctype = validate_upload("shot.png", "image/png", PNG)
        assert name == "shot.png"
        assert ctype == "image/png"

    def test_generic_type_resolves_to_sniffed(self):
        _name, ctype = validate_upload("blob", "application/octet-stream", PNG)
        assert ctype == "image/png"

    def test_jpg_alias_accepted(self):
        _name, ctype = validate_upload("shot.jpg", "image/jpg", JPEG)
        assert ctype == "image/jpeg"

    def test_mismatched_type_rejected(self):
        with pytest.raises(UploadValidationError) as exc:
            validate_upload("shot.png", "image/png", b"plain text bytes here")
        assert getattr(exc.value, "status_code", None) == 422
        with pytest.raises(UploadValidationError) as exc2:
            validate_upload("shot.png", "image/png", JPEG)
        assert getattr(exc2.value, "status_code", None) == 422

    def test_binary_declared_text_rejected(self):
        with pytest.raises(UploadValidationError) as exc:
            validate_upload("log.txt", "text/plain", b"\x00\x01\x02binary")
        assert getattr(exc.value, "status_code", None) == 422

    def test_oversize_rejected(self):
        with pytest.raises(UploadValidationError) as exc:
            validate_upload("big.bin", "application/octet-stream", b"x" * 100, limit=10)
        assert getattr(exc.value, "status_code", None) == 413

    def test_empty_rejected(self):
        with pytest.raises(UploadValidationError):
            validate_upload("e.txt", "text/plain", b"")

    def test_text_and_json_pass(self):
        _n, c = validate_upload("notes.md", "text/markdown", b"# hello\nworld")
        assert c == "text/markdown"
        _n, c = validate_upload("data.json", "application/json", b'{"a": 1}')
        assert c == "application/json"


class TestSanitizeFilename:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("shot.png", "shot.png"),
            ("../../etc/passwd", "passwd"),
            ("..\\..\\win.ini", "win.ini"),
            ("/abs/path/x.txt", "x.txt"),
            ("", "artifact.bin"),
            ("...", "artifact.bin"),
            ("a/b\\c", "c"),
            ("evil<script>.html", "evil_script_.html"),
        ],
    )
    def test_sanitized(self, raw: str, expected: str):
        assert sanitize_filename(raw) == expected

    def test_long_name_truncated(self):
        assert len(sanitize_filename("a" * 200 + ".png")) <= 100


@pytest.mark.asyncio
async def test_upload_endpoint_rejects_mismatch(client: AsyncClient):
    pid = await _auth(client, "upload-mismatch@example.com")
    r = await client.post(
        f"/api/v1/projects/{pid}/evidence",
        files={"file": ("shot.png", b"not a png at all", "image/png")},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_upload_endpoint_sanitizes_traversal_name(client: AsyncClient):
    pid = await _auth(client, "upload-traverse@example.com")
    r = await client.post(
        f"/api/v1/projects/{pid}/evidence",
        files={"file": ("../../evil.txt", b"harmless text", "text/plain")},
    )
    assert r.status_code == 201
    body = r.json()
    assert ".." not in body["original_filename"]
    assert "/" not in body["original_filename"]
    assert body["storage_path"].endswith("/" + body["original_filename"])
    assert ".." not in body["storage_path"]


@pytest.mark.asyncio
async def test_upload_endpoint_accepts_valid_png(client: AsyncClient):
    pid = await _auth(client, "upload-ok@example.com")
    r = await client.post(
        f"/api/v1/projects/{pid}/evidence",
        files={"file": ("shot.png", PNG, "image/png")},
    )
    assert r.status_code == 201
    assert r.json()["content_type"] == "image/png"
