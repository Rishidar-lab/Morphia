"""Evidence upload validation — size, filename, and content checks.

Closes the gap where evidence upload trusted the client-supplied
`Content-Type` and filename verbatim (`docs/security.md` §1.4):

  - size cap (`EVIDENCE_MAX_UPLOAD_BYTES`, default 10 MiB) — 413 over limit
  - filename sanitization — basename only, no traversal, restricted charset
  - magic-byte sniffing cross-checked against the declared content type —
    a `.png` that is actually a script (or vice versa) is rejected
  - text-declared uploads must decode as UTF-8 text without NUL bytes

Stored bytes are never executed or rendered as active content (there is no
byte-serving endpoint; the UI renders metadata + provenance only).
"""

from __future__ import annotations

import os
import re

DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

# Magic-byte signatures mapped to the content types they justify.
_SIGNATURES: tuple[tuple[bytes, tuple[str, ...]], ...] = (
    (b"\x89PNG\r\n\x1a\n", ("image/png",)),
    (b"\xff\xd8\xff", ("image/jpeg", "image/jpg")),
    (b"GIF87a", ("image/gif",)),
    (b"GIF89a", ("image/gif",)),
    (b"%PDF", ("application/pdf",)),
    (b"PK\x03\x04", ("application/zip",)),
    (b"\x1f\x8b", ("application/gzip", "application/x-gzip")),
)

_GENERIC_TYPES = frozenset({"application/octet-stream", "binary/octet-stream"})


def max_upload_bytes() -> int:
    try:
        return int(os.getenv("EVIDENCE_MAX_UPLOAD_BYTES", str(DEFAULT_MAX_UPLOAD_BYTES)))
    except ValueError:
        return DEFAULT_MAX_UPLOAD_BYTES


def sanitize_filename(filename: str | None) -> str:
    """Return a storage-safe basename. Never raises; never returns empty."""
    base = os.path.basename((filename or "").strip().replace("\\", "/"))
    # Drop Windows drive prefix remnants and dot-segments.
    base = base.lstrip(".")
    base = _SAFE_FILENAME_RE.sub("_", base)
    base = base.strip("._")
    if not base:
        return "artifact.bin"
    # Keep an extension-sized tail; cap total length for filesystem sanity.
    if len(base) > 100:
        stem, dot, ext = base.rpartition(".")
        ext = ext[:10] if dot and stem else ""
        base = (stem[: 89 - len(ext)] + (f".{ext}" if ext else "")) or "artifact.bin"
    return base


def sniff_content_type(data: bytes) -> str | None:
    """Detect a known binary type from magic bytes, else None."""
    for magic, _types in _SIGNATURES:
        if data.startswith(magic):
            return _types[0]
    return None


def _is_text(data: bytes) -> bool:
    if b"\x00" in data:
        return False
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


class UploadValidationError(ValueError):
    """Raised when an upload fails validation. `status_code` maps to HTTP."""


def validate_upload(
    filename: str | None,
    content_type: str | None,
    data: bytes,
    limit: int | None = None,
) -> tuple[str, str]:
    """Validate an evidence upload. Returns (safe_filename, stored_content_type).

    Raises UploadValidationError with a `status_code` attribute (413/422).
    """
    cap = limit if limit is not None else max_upload_bytes()
    if len(data) > cap:
        err = UploadValidationError(f"Upload too large ({len(data)} bytes; limit is {cap} bytes).")
        err.status_code = 413  # type: ignore[attr-defined]
        raise err

    if len(data) == 0:
        err = UploadValidationError("Upload is empty.")
        err.status_code = 422  # type: ignore[attr-defined]
        raise err

    declared = (content_type or "application/octet-stream").split(";")[0].strip().lower()
    if declared == "image/jpg":
        declared = "image/jpeg"  # accepted alias
    sniffed = sniff_content_type(data)

    signature_types = {t for _magic, types in _SIGNATURES for t in types}

    if sniffed is not None:
        # Binary signature present: declared type must agree (or be generic).
        if declared not in _GENERIC_TYPES and declared != sniffed:
            err = UploadValidationError(
                f"Content mismatch: file signature indicates {sniffed} "
                f"but declared type is {declared}."
            )
            err.status_code = 422  # type: ignore[attr-defined]
            raise err
        stored_type = sniffed if declared in _GENERIC_TYPES else declared
    elif declared in signature_types:
        # Declared a binary format but bytes carry no such signature.
        err = UploadValidationError(
            f"Content mismatch: declared {declared} but file signature not found."
        )
        err.status_code = 422  # type: ignore[attr-defined]
        raise err
    elif declared.startswith("text/") or declared in (
        "application/json",
        "application/xml",
        "image/svg+xml",
    ):
        if not _is_text(data):
            err = UploadValidationError(
                f"Content mismatch: declared {declared} but bytes are not UTF-8 text."
            )
            err.status_code = 422  # type: ignore[attr-defined]
            raise err
        stored_type = declared
    else:
        stored_type = declared or "application/octet-stream"

    safe_name = sanitize_filename(filename)
    return safe_name, stored_type
