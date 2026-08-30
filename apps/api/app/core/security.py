"""Authentication, password hashing, and session utilities."""

import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash a password using Argon2id."""
    return ph.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against its Argon2id hash."""
    try:
        return ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False


def generate_session_token() -> str:
    """Generate a cryptographically secure session token."""
    return secrets.token_urlsafe(48)


def generate_csrf_token() -> str:
    """Generate a CSRF token."""
    return secrets.token_urlsafe(32)


def session_expiry(lifetime_hours: int = 24) -> datetime:
    """Calculate session expiry timestamp."""
    return datetime.now(UTC) + timedelta(hours=lifetime_hours)
