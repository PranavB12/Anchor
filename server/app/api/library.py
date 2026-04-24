"""
US3 #2 — Personal Library endpoints.

Lets a user save anchors to a personal library and fetch them later regardless of
their physical location.

Endpoints:
    POST   /user/library/save         — save an anchor to the current user's library
    GET    /user/library              — list all saved anchors (newest save first)
    DELETE /user/library/{anchor_id}  — remove an anchor from the library
"""

import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.audit import log_action
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.library import (
    SaveAnchorRequest,
    SavedAnchorExpirationStatus,
    SavedAnchorResponse,
)

router = APIRouter(tags=["Library"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_tags(raw_tags) -> Optional[List[str]]:
    if isinstance(raw_tags, str):
        try:
            parsed = json.loads(raw_tags)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return raw_tags


def _parse_content_types(raw) -> Optional[List[str]]:
    if raw is None:
        return None
    if isinstance(raw, str):
        parsed = [v.strip() for v in raw.split(",") if v.strip()]
        return parsed or None
    if isinstance(raw, list):
        return raw or None
    return None


def _compute_expiration_status(
    anchor_status: Optional[str],
    expiration_time,
    now: Optional[datetime] = None,
) -> str:
    current_time = now or datetime.utcnow()
    if anchor_status == "EXPIRED":
        return SavedAnchorExpirationStatus.EXPIRED
    if expiration_time is not None and expiration_time <= current_time:
        return SavedAnchorExpirationStatus.EXPIRED
    return SavedAnchorExpirationStatus.LIVE


def _expire_past_due_anchors(
    db: Session,
    *,
    now: Optional[datetime] = None,
    anchor_id: Optional[str] = None,
):
    current_time = now or datetime.utcnow()
    query = """
        UPDATE anchors
        SET status = 'EXPIRED'
        WHERE status = 'ACTIVE'
          AND expiration_time IS NOT NULL
          AND expiration_time <= :now
    """
    params = {"now": current_time}
    if anchor_id:
        query += " AND anchor_id = :anchor_id"
        params["anchor_id"] = anchor_id
    db.execute(text(query), params)


def _refresh_saved_anchor_expiration_statuses(
    db: Session,
    user_id: str,
    *,
    now: Optional[datetime] = None,
):
    current_time = now or datetime.utcnow()
    _expire_past_due_anchors(db, now=current_time)
    db.execute(
        text("""
            UPDATE saved_anchors sa
            JOIN anchors a ON a.anchor_id = sa.anchor_id
            SET sa.expiration_status = CASE
                WHEN a.status = 'EXPIRED' THEN 'EXPIRED'
                WHEN a.expiration_time IS NOT NULL AND a.expiration_time <= :now THEN 'EXPIRED'
                ELSE 'LIVE'
            END
            WHERE sa.user_id = :user_id
        """),
        {"user_id": user_id, "now": current_time},
    )
    db.commit()


# ── POST /user/library/save ───────────────────────────────────────────────────

@router.post(
    "/user/library/save",
    response_model=SavedAnchorResponse,
    status_code=status.HTTP_201_CREATED,
)
def save_anchor(
    payload: SaveAnchorRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Save an anchor to the current user's personal library."""
    anchor = db.execute(
        text("""
            SELECT anchor_id, status, expiration_time
            FROM anchors
            WHERE anchor_id = :anchor_id
        """),
        {"anchor_id": payload.anchor_id},
    ).fetchone()
    if not anchor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor not found",
        )

    # Composite PK on (user_id, anchor_id) naturally prevents duplicates —
    # check first so we can return a clean 409 instead of a DB IntegrityError
    existing = db.execute(
        text("""
            SELECT 1 FROM saved_anchors
            WHERE user_id = :user_id AND anchor_id = :anchor_id
        """),
        {"user_id": user_id, "anchor_id": payload.anchor_id},
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Anchor is already in your library",
        )

    _expire_past_due_anchors(db, anchor_id=payload.anchor_id)
    expiration_status = _compute_expiration_status(
        anchor.status,
        anchor.expiration_time,
    )
    db.execute(
        text("""
            INSERT INTO saved_anchors (user_id, anchor_id, expiration_status)
            VALUES (:user_id, :anchor_id, :expiration_status)
        """),
        {
            "user_id": user_id,
            "anchor_id": payload.anchor_id,
            "expiration_status": expiration_status,
        },
    )
    db.commit()

    saved = _fetch_saved_row(db, user_id, payload.anchor_id)
    log_action(
        db, user_id, "ANCHOR_SAVE",
        target_id=payload.anchor_id, target_type="ANCHOR", request=request,
    )
    return _row_to_saved_response(saved)


# ── GET /user/library ─────────────────────────────────────────────────────────

@router.get("/user/library", response_model=List[SavedAnchorResponse])
def list_library(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Return every anchor the user has saved, newest save first."""
    _refresh_saved_anchor_expiration_statuses(db, user_id)
    rows = db.execute(
        text("""
            SELECT
                a.anchor_id, a.creator_id, a.title, a.description,
                ST_X(a.location) AS longitude, ST_Y(a.location) AS latitude,
                a.altitude, a.status, a.visibility, a.unlock_radius,
                a.max_unlock, a.current_unlock, a.activation_time,
                a.expiration_time, a.tags,
                (
                    SELECT GROUP_CONCAT(DISTINCT c.content_type ORDER BY c.content_type SEPARATOR ',')
                    FROM Content c
                    WHERE c.anchor_id = a.anchor_id
                ) AS content_type,
                sa.expiration_status,
                sa.saved_at
            FROM saved_anchors sa
            JOIN anchors a ON a.anchor_id = sa.anchor_id
            WHERE sa.user_id = :user_id
            ORDER BY sa.saved_at DESC
        """),
        {"user_id": user_id},
    ).fetchall()

    return [_row_to_saved_response(row) for row in rows]


# ── DELETE /user/library/{anchor_id} ──────────────────────────────────────────

@router.delete("/user/library/{anchor_id}", status_code=status.HTTP_200_OK)
def remove_from_library(
    anchor_id: str,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Remove an anchor from the current user's library."""
    existing = db.execute(
        text("""
            SELECT 1 FROM saved_anchors
            WHERE user_id = :user_id AND anchor_id = :anchor_id
        """),
        {"user_id": user_id, "anchor_id": anchor_id},
    ).fetchone()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor is not in your library",
        )

    db.execute(
        text("""
            DELETE FROM saved_anchors
            WHERE user_id = :user_id AND anchor_id = :anchor_id
        """),
        {"user_id": user_id, "anchor_id": anchor_id},
    )
    db.commit()

    log_action(
        db, user_id, "ANCHOR_UNSAVE",
        target_id=anchor_id, target_type="ANCHOR", request=request,
    )
    return {"message": "Anchor removed from library"}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fetch_saved_row(db: Session, user_id: str, anchor_id: str):
    return db.execute(
        text("""
            SELECT
                a.anchor_id, a.creator_id, a.title, a.description,
                ST_X(a.location) AS longitude, ST_Y(a.location) AS latitude,
                a.altitude, a.status, a.visibility, a.unlock_radius,
                a.max_unlock, a.current_unlock, a.activation_time,
                a.expiration_time, a.tags,
                (
                    SELECT GROUP_CONCAT(DISTINCT c.content_type ORDER BY c.content_type SEPARATOR ',')
                    FROM Content c
                    WHERE c.anchor_id = a.anchor_id
                ) AS content_type,
                sa.expiration_status,
                sa.saved_at
            FROM saved_anchors sa
            JOIN anchors a ON a.anchor_id = sa.anchor_id
            WHERE sa.user_id = :user_id AND sa.anchor_id = :anchor_id
        """),
        {"user_id": user_id, "anchor_id": anchor_id},
    ).fetchone()


def _row_to_saved_response(row) -> SavedAnchorResponse:
    return SavedAnchorResponse(
        anchor_id=row.anchor_id,
        creator_id=row.creator_id,
        title=row.title,
        description=row.description,
        latitude=row.latitude,
        longitude=row.longitude,
        altitude=row.altitude,
        status=row.status,
        visibility=row.visibility,
        unlock_radius=row.unlock_radius,
        max_unlock=row.max_unlock,
        current_unlock=row.current_unlock,
        activation_time=row.activation_time,
        expiration_time=row.expiration_time,
        always_active=row.expiration_time is None,
        expiration_status=row.expiration_status,
        content_type=_parse_content_types(getattr(row, "content_type", None)),
        tags=_parse_tags(row.tags),
        saved_at=row.saved_at,
    )
