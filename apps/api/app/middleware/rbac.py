"""Role-based access control (RBAC) dependencies.

Defines the canonical set of MORPHIA roles and a FastAPI dependency
factory for enforcing role checks on routes.

Usage:
    @router.post("/", dependencies=[Depends(require_role("researcher", "administrator"))])
    async def create_thing(...):
        ...
"""

import enum
from collections.abc import Callable

from fastapi import Depends, HTTPException

from app.models.auth import User
from app.routers.auth import get_current_user


class Role(enum.StrEnum):
    """Canonical MORPHIA roles — single source of truth for RBAC checks."""

    OWNER = "owner"
    ADMINISTRATOR = "administrator"
    RESEARCHER = "researcher"
    REVIEWER = "reviewer"
    AUDITOR = "auditor"
    WORKER_SERVICE = "worker_service"


# Roles that may act as project/engagement administrators.
OWNER_OR_ADMIN_ROLES = (Role.OWNER, Role.ADMINISTRATOR)


def require_role(*allowed_roles: str | Role) -> Callable[[User], User]:
    """Build a FastAPI dependency that enforces the user's role is in `allowed_roles`.

    Example:
        dependencies=[Depends(require_role("researcher", "administrator"))]
    """
    normalized = {Role(r) if not isinstance(r, Role) else r for r in allowed_roles}
    allowed_values = {r.value for r in normalized}

    def _dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_values:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action.",
            )
        return user

    return _dependency


def require_owner_or_admin() -> Callable[[User], User]:
    """Shortcut dependency requiring the `owner` or `administrator` role."""
    return require_role(*OWNER_OR_ADMIN_ROLES)


def has_role(user: User, *allowed_roles: str | Role) -> bool:
    """Non-dependency helper for imperative role checks inside route bodies."""
    allowed_values = {Role(r).value if not isinstance(r, Role) else r.value for r in allowed_roles}
    return user.role in allowed_values
