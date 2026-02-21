from pydantic import BaseModel, EmailStr, Field
from typing import Optional


# ── Register ──────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Minimum 8 characters")
    username: str = Field(min_length=3, max_length=50)


class RegisterResponse(BaseModel):
    user_id: str
    email: str
    username: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ── Login ─────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    user_id: str
    email: str
    username: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


# ── OAuth ─────────────────────────────────────────────────────────────────────
class OAuthRequest(BaseModel):
    provider: str           # "google"
    id_token: str           # token from the mobile OAuth flow


class OAuthResponse(BaseModel):
    user_id: str
    email: str
    username: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    is_new_user: bool


# ── Token refresh ─────────────────────────────────────────────────────────────
class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Logout ────────────────────────────────────────────────────────────────────
class LogoutRequest(BaseModel):
    refresh_token: str


# ── Shared user info ──────────────────────────────────────────────────────────
class UserOut(BaseModel):
    user_id: str
    email: str
    username: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_ghost_mode: bool