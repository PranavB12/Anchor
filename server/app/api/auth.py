"""
US1 #2 — Registration and Login API (email + OAuth)
US2 #2 & #4 — Password Reset (request + confirm)

Endpoints:
    POST /auth/register               — create new account with email/password
    POST /auth/login                  — login with email/password
    POST /auth/oauth                  — login or register with Google OAuth
    POST /auth/refresh                — get new access token using refresh token
    GET  /auth/verify                 — verify access token and return user info
    POST /auth/logout                 — revoke session
    POST /auth/password-reset/request — send password reset email with token
    POST /auth/password-reset/confirm — reset password using valid token
"""

import uuid
import secrets
import logging
from datetime import datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.email import send_email
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
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_by_email(db: Session, email: str):
    """Look up a user row by email address. Returns None if not found."""
    result = db.execute(
        text("SELECT * FROM users WHERE email = :email"),
        {"email": email},
    ).fetchone()
    return result


def _get_user_by_id(db: Session, user_id: str):
    """Look up a user row by user_id (UUID). Returns None if not found."""
    result = db.execute(
        text("SELECT * FROM users WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()
    return result


def _create_session(db: Session, user_id: str, refresh_token: str):
    """
    Store a new refresh token session in user_sessions.
    Session expiry is set based on REFRESH_TOKEN_EXPIRE_DAYS in settings.
    Each login creates a new session row — multiple devices are supported.
    """
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
    """
    Soft-revoke a session by setting revoked_at timestamp.
    The session row is kept for audit purposes but will fail validation checks.
    """
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
    """
    Check if a refresh token session is still valid.
    A session is valid if it exists, has not been revoked, and has not expired.
    Returns True if valid, False otherwise.
    """
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
    """Update the last_login timestamp for a user on every successful login."""
    db.execute(
        text("UPDATE users SET last_login = :now WHERE user_id = :user_id"),
        {"now": datetime.utcnow(), "user_id": user_id},
    )
    db.commit()


def _revoke_all_sessions_for_user(db: Session, user_id: str):
    """
    Revoke all active sessions for a user at once.
    Called after a password reset to force re-login on all devices.
    Only affects sessions that haven't already been revoked.
    """
    db.execute(
        text("""
            UPDATE user_sessions
            SET revoked_at = :now
            WHERE user_id = :user_id AND revoked_at IS NULL
        """),
        {"now": datetime.utcnow(), "user_id": user_id},
    )
    db.commit()


def _build_password_reset_link(reset_token: str) -> str:
    """
    Build a deep link URL for password reset by appending the token as a query param.
    Base URL is configured via PASSWORD_RESET_DEEP_LINK_BASE in settings.
    Preserves any existing query params already in the base URL.
    Example output: anchor://reset-password?token=abc123
    """
    base_url = settings.PASSWORD_RESET_DEEP_LINK_BASE.strip()
    parsed = urlsplit(base_url)
    # Preserve any existing query params, then append the reset token
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["token"] = reset_token
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


def _send_password_reset_email(recipient_email: str, reset_link: str, reset_token: str):
    """
    Send the password reset email with both plain text and HTML versions.
    Returns True if sent successfully, False if the email service failed.
    Expiry time shown in the email comes from PASSWORD_RESET_TOKEN_EXPIRE_MINUTES in settings.
    """
    subject = "Reset your Anchor password"
    text_body = (
        "We received a request to reset your Anchor password.\n\n"
        "Try opening this link in your device:\n"
        f"{reset_link}\n\n"
        "If the link does not open the app from your email client, copy this token and paste it in the app's Reset Password screen:\n"
        f"{reset_token}\n\n"
        f"This link/token expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.\n"
        "If you did not request a password reset, you can ignore this email."
    )
    html_body = (
        "<p>We received a request to reset your Anchor password.</p>"
        f"<p><a href=\"{reset_link}\">Open Reset Link</a></p>"
        "<p>If your email app does not open the deep link, copy this URL into your browser/app:</p>"
        f"<p><code>{reset_link}</code></p>"
        "<p>Or paste this token directly in the app's Reset Password screen:</p>"
        f"<p><code>{reset_token}</code></p>"
        f"<p>This link/token expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>"
        "<p>If you did not request a password reset, you can ignore this email.</p>"
    )
    return send_email(
        to_email=recipient_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    Create a new account with email and password.
    Acceptance criteria: user data stored with hashed password, returns tokens.
    """
    # Block duplicate emails — each account must have a unique email
    if _get_user_by_email(db, payload.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Block duplicate usernames — each account must have a unique username
    existing_username = db.execute(
        text("SELECT user_id FROM users WHERE username = :username"),
        {"username": payload.username},
    ).fetchone()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This username is already taken",
        )

    # Generate UUID and store user with bcrypt-hashed password
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

    # Issue both access token (short-lived) and refresh token (long-lived)
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
    Acceptance criteria: valid credentials return tokens for authenticated app flow.
    Invalid credentials return 401 — same message used for both wrong email and wrong
    password to avoid revealing whether an account exists (security best practice).
    """
    user = _get_user_by_email(db, payload.email)

    # Return the same error message for both wrong email and wrong password
    # to avoid leaking whether an account exists for a given email
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

    # Issue both access token (short-lived) and refresh token (long-lived)
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
    The Google ID token is verified against Google's tokeninfo endpoint.
    New users get a username auto-generated from their Google display name.
    """
    if payload.provider != "google":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only 'google' is supported as an OAuth provider",
        )

    # Verify the Google ID token by calling Google's tokeninfo endpoint
    try:
        response = httpx.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.id_token}",
            timeout=10.0,
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

    # Validate token audience matches our configured Google client IDs
    audience = google_data.get("aud")
    allowed_client_ids = settings.GOOGLE_ALLOWED_CLIENT_IDS
    if allowed_client_ids and audience not in allowed_client_ids:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token audience does not match configured client IDs",
        )

    # Only allow verified Google email addresses
    email_verified = str(google_data.get("email_verified", "")).lower() == "true"
    if not email_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is not verified",
        )

    # Extract Google user identity fields
    google_id = google_data.get("sub")  # Google's unique user identifier
    email = google_data.get("email")

    if not google_id or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from Google token",
        )

    # Use Google display name for username generation, fall back to email prefix
    display_name = google_data.get("name") or email.split("@")[0]
    name = display_name.replace(" ", "_").lower()

    user = _get_user_by_email(db, email)
    is_new_user = False

    if not user:
        # New user — register them automatically via OAuth
        is_new_user = True
        user_id = str(uuid.uuid4())

        # Generate a unique username — append incrementing counter if base name is taken
        base_username = name[:47] if len(name) > 47 else name
        if not base_username:
            base_username = f"user_{uuid.uuid4().hex[:8]}"
        username = base_username
        counter = 1
        while db.execute(
            text("SELECT user_id FROM users WHERE username = :username"),
            {"username": username},
        ).fetchone():
            username = f"{base_username}{counter}"
            counter += 1

        # OAuth users have no password_hash — they always authenticate via Google
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

    # Issue tokens for both new and existing OAuth users
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
    The refresh token is first decoded to extract the user_id,
    then validated against the database to ensure it hasn't been revoked or expired.
    """
    # Decode the refresh token JWT to get the user_id
    user_id = decode_refresh_token(payload.refresh_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    # Also validate against DB in case session was explicitly revoked (e.g. logout)
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
    Used by the frontend on app startup to restore a session without re-logging in.
    The token itself is validated by the get_current_user_id dependency.
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
    The access token will expire naturally — only the refresh token is explicitly revoked.
    """
    _revoke_session(db, payload.refresh_token)
    return {"message": "Successfully logged out"}


# ── Password Reset ────────────────────────────────────────────────────────────

@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Generate a password reset token and send it via email.
    Always returns the same generic success message regardless of whether the
    email exists — this prevents email enumeration attacks.
    Token is stored in the users table with an expiry timestamp.
    In DEBUG mode, the raw token is also returned in the response for local testing.
    """
    user = _get_user_by_email(db, payload.email)
    reset_token_for_debug = None

    if user:
        # Generate a cryptographically secure random token
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(
            minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        )
        # Store token and expiry on the user row
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

        # Build the deep link and send the reset email
        reset_link = _build_password_reset_link(reset_token)
        sent = _send_password_reset_email(payload.email, reset_link, reset_token)
        if not sent:
            # Log warning but don't expose email failure to the client
            logger.warning("Password reset email was not sent for %s", payload.email)

        # In DEBUG mode only, return the raw token so developers can test
        # without needing a real email service configured
        if settings.DEBUG:
            reset_token_for_debug = reset_token

    # Always return the same message whether the email exists or not
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
    Validates that the token exists and has not expired.
    On success: updates password hash, clears the reset token, and
    revokes all existing sessions to force re-login on all devices.
    """
    # Look up user by token — also checks expiry in the query for atomicity
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

    # Update password and clear the reset token so it can't be reused
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

    # Revoke all active sessions — user must log in again with new password
    _revoke_all_sessions_for_user(db, user.user_id)

    return MessageResponse(message="Password reset successful")
