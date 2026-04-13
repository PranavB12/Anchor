"""
US7 — Circle Membership Management

Endpoints:
    GET    /circles/{circle_id}/members              — list all members of a circle
    POST   /circles/{circle_id}/members              — invite a user by username (owner only)
    DELETE /circles/{circle_id}/members/{user_id}    — remove a member (owner only)
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from app.core.database import get_db
from app.core.dependencies import get_current_user_id

router = APIRouter(prefix="/circles", tags=["Circles"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CircleMemberResponse(BaseModel):
    user_id: str
    username: str
    avatar_url: Optional[str] = None
    joined_at: str


class InviteMemberRequest(BaseModel):
    username: str

# ── Search Schemas ────────────────────────────────────────────────────────────

class CircleSearchResult(BaseModel):
    circle_id: str
    name: str
    description: Optional[str] = None
    member_count: int
    is_member: bool


# ── Search Public Circles (US8 Task 1) ────────────────────────────────────────

@router.get("/search", response_model=List[CircleSearchResult])
def search_circles(
    q: str = "",
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT
                c.circle_id,
                c.name,
                c.description,
                COUNT(cm.user_id) AS member_count,
                MAX(CASE WHEN cm.user_id = :user_id THEN 1 ELSE 0 END) AS is_member
            FROM circles c
            LEFT JOIN circle_members cm ON cm.circle_id = c.circle_id
            WHERE c.visibility = 'PUBLIC'
              AND (c.name LIKE :query OR c.description LIKE :query)
            GROUP BY c.circle_id, c.name, c.description
            ORDER BY member_count DESC
        """),
        {"query": f"%{q}%", "user_id": user_id},
    ).fetchall()

    return [
        CircleSearchResult(
            circle_id=row.circle_id,
            name=row.name,
            description=row.description,
            member_count=row.member_count,
            is_member=bool(row.is_member),
        )
        for row in rows
    ]


# ── Join Circle (US8 Task 3) ──────────────────────────────────────────────────

@router.post("/{circle_id}/join", status_code=status.HTTP_201_CREATED)
def join_circle(
    circle_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    circle = _get_circle(db, circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")

    if circle.visibility != "PUBLIC":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This circle is private and cannot be joined directly",
        )

    already_member = db.execute(
        text("""
            SELECT 1 FROM circle_members
            WHERE circle_id = :circle_id AND user_id = :user_id
        """),
        {"circle_id": circle_id, "user_id": user_id},
    ).fetchone()

    if already_member:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already a member of this circle",
        )

    db.execute(
        text("""
            INSERT INTO circle_members (circle_id, user_id)
            VALUES (:circle_id, :user_id)
        """),
        {"circle_id": circle_id, "user_id": user_id},
    )
    db.commit()
    return {"message": "Successfully joined the circle"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_circle(db: Session, circle_id: str):
    """Fetch a circle by ID. Returns None if not found."""
    return db.execute(
        text("SELECT * FROM circles WHERE circle_id = :circle_id"),
        {"circle_id": circle_id},
    ).fetchone()


def _require_owner(circle, user_id: str):
    """Raise 403 if the current user is not the circle owner."""
    if circle.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the circle owner can perform this action",
        )


# ── List Members ──────────────────────────────────────────────────────────────

@router.get("/{circle_id}/members", response_model=List[CircleMemberResponse])
def list_members(
    circle_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Return all members of a circle.
    The requesting user must be a member or the owner.
    """
    circle = _get_circle(db, circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")

    # Check requesting user is owner or member
    is_member = db.execute(
        text("""
            SELECT 1 FROM circle_members
            WHERE circle_id = :circle_id AND user_id = :user_id
        """),
        {"circle_id": circle_id, "user_id": user_id},
    ).fetchone()

    if not is_member and circle.owner_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this circle",
        )

    rows = db.execute(
        text("""
            SELECT u.user_id, u.username, u.avatar_url, cm.joined_at
            FROM circle_members cm
            JOIN users u ON u.user_id = cm.user_id
            WHERE cm.circle_id = :circle_id
            ORDER BY cm.joined_at ASC
        """),
        {"circle_id": circle_id},
    ).fetchall()

    return [
        CircleMemberResponse(
            user_id=row.user_id,
            username=row.username,
            avatar_url=row.avatar_url,
            joined_at=str(row.joined_at),
        )
        for row in rows
    ]


# ── Invite Member ─────────────────────────────────────────────────────────────

@router.post("/{circle_id}/members", status_code=status.HTTP_201_CREATED)
def invite_member(
    circle_id: str,
    payload: InviteMemberRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Invite a user to the circle by username. Owner only.
    Returns 409 if the user is already a member.
    """
    circle = _get_circle(db, circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")

    _require_owner(circle, user_id)

    # Look up the user by username
    target = db.execute(
        text("SELECT user_id FROM users WHERE username = :username"),
        {"username": payload.username},
    ).fetchone()

    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for duplicate membership
    already_member = db.execute(
        text("""
            SELECT 1 FROM circle_members
            WHERE circle_id = :circle_id AND user_id = :target_id
        """),
        {"circle_id": circle_id, "target_id": target.user_id},
    ).fetchone()

    if already_member:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this circle",
        )

    # Add the member
    db.execute(
        text("""
            INSERT INTO circle_members (circle_id, user_id)
            VALUES (:circle_id, :user_id)
        """),
        {"circle_id": circle_id, "user_id": target.user_id},
    )
    db.commit()

    return {"message": f"{payload.username} has been added to the circle"}


# ── Remove Member ─────────────────────────────────────────────────────────────

@router.delete("/{circle_id}/members/{target_user_id}", status_code=status.HTTP_200_OK)
def remove_member(
    circle_id: str,
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Remove a member from the circle. Owner only.
    Returns 404 if the target user is not a member.
    """
    circle = _get_circle(db, circle_id)
    if not circle:
        raise HTTPException(status_code=404, detail="Circle not found")

    _require_owner(circle, user_id)

    # Check the target is actually a member
    is_member = db.execute(
        text("""
            SELECT 1 FROM circle_members
            WHERE circle_id = :circle_id AND user_id = :target_user_id
        """),
        {"circle_id": circle_id, "target_user_id": target_user_id},
    ).fetchone()

    if not is_member:
        raise HTTPException(status_code=404, detail="User is not a member of this circle")

    db.execute(
        text("""
            DELETE FROM circle_members
            WHERE circle_id = :circle_id AND user_id = :target_user_id
        """),
        {"circle_id": circle_id, "target_user_id": target_user_id},
    )
    db.commit()

    return {"message": "Member removed successfully"}