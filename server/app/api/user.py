"""
US4 #1 — PATCH /user/profile endpoint
US4 #4 — Email uniqueness check

Endpoints:
    GET  /user/profile  — get current user profile
    PATCH /user/profile — update username, email, bio, avatar_url
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.user import UpdateProfileRequest, ProfileResponse

router = APIRouter(prefix="/user", tags=["User Profile"])


# ── Get Profile ───────────────────────────────────────────────────────────────

@router.get("/profile", response_model=ProfileResponse)
def get_profile(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Get the current user's profile."""
    user = db.execute(
        text("SELECT * FROM users WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return ProfileResponse(
        user_id=user.user_id,
        email=user.email,
        username=user.username,
        bio=user.bio,
        avatar_url=user.avatar_url,
        is_ghost_mode=user.is_ghost_mode,
    )


# ── Update Profile ────────────────────────────────────────────────────────────

@router.patch("/profile", response_model=ProfileResponse)
def update_profile(
    payload: UpdateProfileRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Update profile fields. Only provided fields are updated.
    US4 #4 — checks email uniqueness before updating.
    """
    # Check email uniqueness if email is being changed (US4 #4)
    if payload.email:
        existing = db.execute(
            text("SELECT user_id FROM users WHERE email = :email AND user_id != :user_id"),
            {"email": payload.email, "user_id": user_id},
        ).fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already in use by another account",
            )

    # Check username uniqueness if username is being changed
    if payload.username:
        existing = db.execute(
            text("SELECT user_id FROM users WHERE username = :username AND user_id != :user_id"),
            {"username": payload.username, "user_id": user_id},
        ).fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This username is already taken",
            )

    # Build dynamic update query from only the fields provided
    fields = {}
    if payload.username is not None:
        fields["username"] = payload.username
    if payload.email is not None:
        fields["email"] = payload.email
    if payload.bio is not None:
        fields["bio"] = payload.bio
    if payload.avatar_url is not None:
        fields["avatar_url"] = payload.avatar_url

    if fields:
        set_clause = ", ".join(f"{k} = :{k}" for k in fields)
        fields["user_id"] = user_id
        db.execute(
            text(f"UPDATE users SET {set_clause} WHERE user_id = :user_id"),
            fields,
        )
        db.commit()

    # Return updated profile
    user = db.execute(
        text("SELECT * FROM users WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()

    return ProfileResponse(
        user_id=user.user_id,
        email=user.email,
        username=user.username,
        bio=user.bio,
        avatar_url=user.avatar_url,
        is_ghost_mode=user.is_ghost_mode,
    )