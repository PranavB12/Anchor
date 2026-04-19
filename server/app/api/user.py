"""
User profile and block-management endpoints.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.audit import log_action

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.user import (
    BlockedUserResponse,
    BlockUserRequest,
    ProfileResponse,
    UpdateProfileRequest,
)

router = APIRouter(tags=["User"])


# ── Get Profile ───────────────────────────────────────────────────────────────

@router.get("/user/profile", response_model=ProfileResponse)
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

@router.patch("/user/profile", response_model=ProfileResponse)
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
    if payload.is_ghost_mode is not None:
        fields["is_ghost_mode"] = payload.is_ghost_mode

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


@router.get("/users/blocked", response_model=List[BlockedUserResponse])
def list_blocked_users(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT
                u.user_id,
                u.username,
                u.avatar_url,
                bu.created_at AS blocked_at
            FROM blocked_users bu
            JOIN users u
                ON u.user_id = bu.blocked_user_id
            WHERE bu.blocker_id = :user_id
            ORDER BY bu.created_at DESC, u.username ASC
        """),
        {"user_id": user_id},
    ).fetchall()

    return [
        BlockedUserResponse(
            user_id=row.user_id,
            username=row.username,
            avatar_url=row.avatar_url,
            blocked_at=row.blocked_at,
        )
        for row in rows
    ]


@router.post("/users/block", response_model=BlockedUserResponse, status_code=status.HTTP_200_OK)
def block_user(
    payload: BlockUserRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    blocked_user = db.execute(
        text("""
            SELECT user_id, username, avatar_url
            FROM users
            WHERE user_id = :blocked_user_id
        """),
        {"blocked_user_id": payload.blocked_user_id},
    ).fetchone()

    if not blocked_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if payload.blocked_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot block yourself",
        )

    db.execute(
        text("""
            INSERT IGNORE INTO blocked_users (blocker_id, blocked_user_id)
            VALUES (:blocker_id, :blocked_user_id)
        """),
        {"blocker_id": user_id, "blocked_user_id": payload.blocked_user_id},
    )
    db.commit()

    blocked_row = db.execute(
        text("""
            SELECT created_at
            FROM blocked_users
            WHERE blocker_id = :blocker_id
              AND blocked_user_id = :blocked_user_id
        """),
        {"blocker_id": user_id, "blocked_user_id": payload.blocked_user_id},
    ).fetchone()

    log_action(
        db,
        user_id,
        "USER_BLOCK",
        target_id=payload.blocked_user_id,
        target_type="USER",
        request=request,
    )

    return BlockedUserResponse(
        user_id=blocked_user.user_id,
        username=blocked_user.username,
        avatar_url=blocked_user.avatar_url,
        blocked_at=blocked_row.created_at,
    )


@router.delete("/users/block", status_code=status.HTTP_200_OK)
def unblock_user(
    payload: BlockUserRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    target_user = db.execute(
        text("""
            SELECT user_id
            FROM users
            WHERE user_id = :blocked_user_id
        """),
        {"blocked_user_id": payload.blocked_user_id},
    ).fetchone()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    db.execute(
        text("""
            DELETE FROM blocked_users
            WHERE blocker_id = :blocker_id
              AND blocked_user_id = :blocked_user_id
        """),
        {"blocker_id": user_id, "blocked_user_id": payload.blocked_user_id},
    )
    db.commit()

    log_action(
        db,
        user_id,
        "USER_UNBLOCK",
        target_id=payload.blocked_user_id,
        target_type="USER",
        request=request,
    )

    return {"message": "User unblocked successfully"}
