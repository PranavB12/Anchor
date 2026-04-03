"""
FastAPI dependencies — reusable across all route files.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token

bearer_scheme = HTTPBearer()
ACCOUNT_DISABLED_DETAIL = "This account has been disabled"


def ensure_user_is_active(db: Session, user_id: str):
    user = db.execute(
        text("""
            SELECT user_id, is_banned
            FROM users
            WHERE user_id = :user_id
        """),
        {"user_id": user_id},
    ).fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if bool(getattr(user, "is_banned", False)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ACCOUNT_DISABLED_DETAIL,
        )

    return user


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> str:
    """
    Extracts and validates the JWT from the Authorization: Bearer <token> header.
    Returns the user_id string if valid, raises 401 otherwise.
    """
    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    ensure_user_is_active(db, user_id)
    return user_id
