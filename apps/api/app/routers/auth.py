"""Authentication routes: register, login, logout, me."""

from fastapi import APIRouter, Depends, HTTPException, Response, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    generate_session_token,
    generate_csrf_token,
    session_expiry,
)
from app.models.auth import User, Session

router = APIRouter()
settings = get_settings()


# ── Schemas ──────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    role: str

    model_config = {"from_attributes": True}


# ── Helpers ──────────────────────────────────────────────
GENERIC_AUTH_ERROR = "Invalid email or password."


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    """Extract and validate the session from cookie or Authorization header."""
    token = request.cookies.get("sid")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")

    result = await db.execute(
        select(Session).where(Session.token == token, Session.is_valid())
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")

    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account is inactive.")

    return user


# ── Routes ───────────────────────────────────────────────
@router.post("/register", response_model=UserResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> User:
    """Register a new user account."""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered.")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    await db.flush()
    return user


@router.post("/login")
async def login(
    body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)
) -> dict[str, object]:
    """Authenticate and create a session."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail=GENERIC_AUTH_ERROR)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive.")

    token = generate_session_token()
    csrf = generate_csrf_token()
    session = Session(
        user_id=user.id,
        token=token,
        csrf_token=csrf,
        expires_at=session_expiry(settings.session_lifetime_hours),
    )
    db.add(session)
    await db.flush()

    response.set_cookie(
        key="sid",
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.session_lifetime_hours * 3600,
    )

    return {
        "user": UserResponse.model_validate(user),
        "csrfToken": csrf,
    }


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    """Invalidate the current session."""
    token = request.cookies.get("sid")
    if token:
        result = await db.execute(select(Session).where(Session.token == token))
        session = result.scalar_one_or_none()
        if session:
            await db.delete(session)

    response.delete_cookie("sid")
    return {"status": "logged_out"}


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> User:
    """Return the current authenticated user."""
    return user
