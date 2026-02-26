"""
US1 #2 — Registration and Login API (email + OAuth)

Endpoints:
    POST /auth/register  — create new account with email/password
    POST /auth/login     — login with email/password
    POST /auth/oauth     — login or register with Google OAuth
    POST /auth/refresh   — get new access token using refresh token
    POST /auth/logout    — revoke session
"""

import uuid
import secrets
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MessageResponse,
    LogoutRequest,
    OAuthRequest,
    OAuthResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
    RegisterResponse,
    VerifyTokenResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_by_email(db: Session, email: str):
    result = db.execute(
        text("SELECT * FROM users WHERE email = :email"),
        {"email": email},
    ).fetchone()
    return result


def _get_user_by_id(db: Session, user_id: str):
    result = db.execute(
        text("SELECT * FROM users WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()
    return result


def _create_session(db: Session, user_id: str, refresh_token: str):
    session_id = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.execute(
        text("""
            INSERT INTO user_sessions (session_id, user_id, token, expires_at)
            VALUES (:session_id, :user_id, :token, :expires_at)
        """),
        {
            "session_id": session_id,
            "user_id": user_id,
            "token": refresh_token,
            "expires_at": expires_at,
        },
    )
    db.commit()


def _revoke_session(db: Session, refresh_token: str):
    db.execute(
        text("""
            UPDATE user_sessions
            SET revoked_at = :now
            WHERE token = :token
        """),
        {"now": datetime.utcnow(), "token": refresh_token},
    )
    db.commit()


def _is_session_valid(db: Session, refresh_token: str) -> bool:
    result = db.execute(
        text("""
            SELECT session_id FROM user_sessions
            WHERE token = :token
            AND revoked_at IS NULL
            AND expires_at > :now
        """),
        {"token": refresh_token, "now": datetime.utcnow()},
    ).fetchone()
    return result is not None


def _update_last_login(db: Session, user_id: str):
    db.execute(
        text("UPDATE users SET last_login = :now WHERE user_id = :user_id"),
        {"now": datetime.utcnow(), "user_id": user_id},
    )
    db.commit()


def _revoke_all_sessions_for_user(db: Session, user_id: str):
    db.execute(
        text("""
            UPDATE user_sessions
            SET revoked_at = :now
            WHERE user_id = :user_id AND revoked_at IS NULL
        """),
        {"now": datetime.utcnow(), "user_id": user_id},
    )
    db.commit()


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    Create a new account with email and password.
    Acceptance criteria: user data stored with hashed password, returns tokens.
    """
    # Check email is not already taken
    if _get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Check username is not already taken
    existing_username = db.execute(
        text("SELECT user_id FROM users WHERE username = :username"),
        {"username": payload.username},
    ).fetchone()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken",
        )

    # Create user
    user_id = str(uuid.uuid4())
    db.execute(
        text("""
            INSERT INTO users (user_id, email, password_hash, username)
            VALUES (:user_id, :email, :password_hash, :username)
        """),
        {
            "user_id": user_id,
            "email": payload.email,
            "password_hash": hash_password(payload.password),
            "username": payload.username,
        },
    )
    db.commit()

    # Create tokens
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)
    _create_session(db, user_id, refresh_token)
    _update_last_login(db, user_id)

    return RegisterResponse(
        user_id=user_id,
        email=payload.email,
        username=payload.username,
        access_token=access_token,
        refresh_token=refresh_token,
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Login with email and password.
    Acceptance criteria: valid credentials redirect to main map view (return tokens).
    Invalid credentials return error message.
    """
    user = _get_user_by_email(db, payload.email)

    # Invalid email or password
    if not user or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Create tokens
    access_token = create_access_token(user.user_id)
    refresh_token = create_refresh_token(user.user_id)
    _create_session(db, user.user_id, refresh_token)
    _update_last_login(db, user.user_id)

    return LoginResponse(
        user_id=user.user_id,
        email=user.email,
        username=user.username,
        access_token=access_token,
        refresh_token=refresh_token,
    )


# ── OAuth ─────────────────────────────────────────────────────────────────────

@router.post("/oauth", response_model=OAuthResponse)
def oauth_login(payload: OAuthRequest, db: Session = Depends(get_db)):
    """
    Login or register using Google OAuth.
    Acceptance criteria: OAuth creates new account or logs into existing one.
    """
    if payload.provider != "google":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only 'google' is supported as an OAuth provider",
        )

    # Verify the Google ID token
    try:
        response = httpx.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.id_token}"
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token",
            )
        google_data = response.json()
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach Google OAuth service",
        )

    google_id = google_data.get("sub")
    email = google_data.get("email")
    name = google_data.get("name", "").replace(" ", "_").lower()

    if not google_id or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from Google token",
        )

    # Check if user already exists
    user = _get_user_by_email(db, email)
    is_new_user = False

    if not user:
        # Register new OAuth user
        is_new_user = True
        user_id = str(uuid.uuid4())

        # Generate unique username from Google name
        base_username = name[:47] if len(name) > 47 else name
        username = base_username
        counter = 1
        while db.execute(
            text("SELECT user_id FROM users WHERE username = :username"),
            {"username": username},
        ).fetchone():
            username = f"{base_username}{counter}"
            counter += 1

        db.execute(
            text("""
                INSERT INTO users (user_id, email, username, oauth_provider, oauth_provider_id)
                VALUES (:user_id, :email, :username, :provider, :provider_id)
            """),
            {
                "user_id": user_id,
                "email": email,
                "username": username,
                "provider": "google",
                "provider_id": google_id,
            },
        )
        db.commit()
        user = _get_user_by_id(db, user_id)

    # Create tokens
    access_token = create_access_token(user.user_id)
    refresh_token = create_refresh_token(user.user_id)
    _create_session(db, user.user_id, refresh_token)
    _update_last_login(db, user.user_id)

    return OAuthResponse(
        user_id=user.user_id,
        email=user.email,
        username=user.username,
        access_token=access_token,
        refresh_token=refresh_token,
        is_new_user=is_new_user,
    )


# ── Refresh Token ─────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=RefreshResponse)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    """
    Get a new access token using a valid refresh token.
    """
    user_id = decode_refresh_token(payload.refresh_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if not _is_session_valid(db, payload.refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked or expired",
        )

    access_token = create_access_token(user_id)
    return RefreshResponse(access_token=access_token)


# ── Verify Access Token ───────────────────────────────────────────────────────

@router.get("/verify", response_model=VerifyTokenResponse)
def verify_token(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Verify the access token and return basic user info when valid.
    """
    user = _get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return VerifyTokenResponse(
        user_id=user.user_id,
        email=user.email,
        username=user.username,
    )


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    """
    Revoke the refresh token / session.
    Acceptance criteria: tokens removed and invalidated, 401 on protected routes after logout.
    """
    _revoke_session(db, payload.refresh_token)
    return {"message": "Successfully logged out"}


# ── Password Reset ────────────────────────────────────────────────────────────

@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Generate a password reset token and store it.
    Returns a generic success message whether the email exists or not.
    """
    user = _get_user_by_email(db, payload.email)
    reset_token_for_debug = None

    if user:
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(
            minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        )
        db.execute(
            text("""
                UPDATE users
                SET reset_token = :reset_token, reset_token_expiry = :expiry
                WHERE user_id = :user_id
            """),
            {
                "reset_token": reset_token,
                "expiry": expires_at,
                "user_id": user.user_id,
            },
        )
        db.commit()

        # Email delivery can be added later; return token in DEBUG mode for testing.
        if settings.DEBUG:
            reset_token_for_debug = reset_token

    return PasswordResetRequestResponse(
        message="If an account with that email exists, a password reset link has been sent.",
        reset_token=reset_token_for_debug,
    )


@router.post("/password-reset/confirm", response_model=MessageResponse)
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    db: Session = Depends(get_db),
):
    """
    Reset the user's password using a valid reset token.
    """
    user = db.execute(
        text("""
            SELECT * FROM users
            WHERE reset_token = :token
            AND reset_token_expiry IS NOT NULL
            AND reset_token_expiry > :now
        """),
        {"token": payload.token, "now": datetime.utcnow()},
    ).fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :password_hash,
                reset_token = NULL,
                reset_token_expiry = NULL
            WHERE user_id = :user_id
        """),
        {
            "password_hash": hash_password(payload.new_password),
            "user_id": user.user_id,
        },
    )
    db.commit()

    _revoke_all_sessions_for_user(db, user.user_id)

    return MessageResponse(message="Password reset successful")
