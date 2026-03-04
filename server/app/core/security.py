"""
Security helpers:
- Password hashing with bcrypt (direct library, not passlib)
- JWT access + refresh token creation and verification using python-jose
"""
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
import bcrypt

from app.core.config import settings

# Note: passlib CryptContext was replaced with direct bcrypt calls
# to avoid the bcrypt version warning in Python 3.13
# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """
    Hash a plain text password using bcrypt.
    A new random salt is generated for every call, so two hashes of the
    same password will always be different — this prevents rainbow table attacks.
    Returns the hash as a UTF-8 string for storage in the database.
    """
    pwd_bytes = plain.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed_bytes = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_bytes.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verify a plain text password against a stored bcrypt hash.
    Uses bcrypt.checkpw which handles salt extraction automatically.
    Returns True if the password matches, False otherwise.
    """
    pwd_bytes = plain.encode("utf-8")
    hashed_bytes = hashed.encode("utf-8")
    return bcrypt.checkpw(pwd_bytes, hashed_bytes)


# ── JWT ───────────────────────────────────────────────────────────────────────

def _create_token(data: dict, expires_delta: timedelta) -> str:
    """
    Internal helper to create a signed JWT with an expiry time.
    The payload is copied to avoid mutating the caller's dict.
    Signed using SECRET_KEY and ALGORITHM from settings (typically HS256).
    """
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + expires_delta
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(user_id: str) -> str:
    """
    Create a short-lived access token for API authentication.
    Expires after ACCESS_TOKEN_EXPIRE_MINUTES (typically 60 minutes).
    The 'type' claim is set to 'access' to prevent refresh tokens
    from being used as access tokens.
    """
    return _create_token(
        {"sub": user_id, "type": "access"},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: str) -> str:
    """
    Create a long-lived refresh token for obtaining new access tokens.
    Expires after REFRESH_TOKEN_EXPIRE_DAYS (typically 7 days).
    The 'type' claim is set to 'refresh' to prevent access tokens
    from being used as refresh tokens.
    """
    return _create_token(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_access_token(token: str) -> Optional[str]:
    """
    Decode and validate an access token.
    Verifies signature, expiry, and that the token type is 'access'.
    Returns the user_id (sub claim) if valid, None if invalid or expired.
    JWTError covers all jose decode failures including expiry and bad signature.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Reject refresh tokens being used in place of access tokens
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[str]:
    """
    Decode and validate a refresh token.
    Verifies signature, expiry, and that the token type is 'refresh'.
    Returns the user_id (sub claim) if valid, None if invalid or expired.
    JWTError covers all jose decode failures including expiry and bad signature.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Reject access tokens being used in place of refresh tokens
        if payload.get("type") != "refresh":
            return None
        return payload.get("sub")
    except JWTError:
        return None