"""
US5 #1 — Anchor Creation API

Endpoints:
    POST /anchors  — create a new Anchor tied to a location
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.anchor import CreateAnchorRequest, AnchorResponse

router = APIRouter(prefix="/anchors", tags=["Anchors"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_anchor_by_id(db: Session, anchor_id: str):
    row = db.execute(
        text("""
            SELECT anchor_id, creator_id, title, description,
                   ST_X(location) AS longitude, ST_Y(location) AS latitude,
                   altitude, status, visibility, unlock_radius,
                   max_unlock, current_unlock, activation_time,
                   expiration_time, tags
            FROM anchors
            WHERE anchor_id = :anchor_id
        """),
        {"anchor_id": anchor_id},
    ).fetchone()
    return row


def _row_to_response(row) -> AnchorResponse:
    tags = row.tags
    if isinstance(tags, str):
        tags = json.loads(tags)
    return AnchorResponse(
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
        tags=tags,
    )


# ── Create Anchor ─────────────────────────────────────────────────────────────

@router.post("/", response_model=AnchorResponse, status_code=status.HTTP_201_CREATED)
def create_anchor(
    payload: CreateAnchorRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Create a new Anchor at the given location.
    The caller's user_id is set as the creator.
    """
    if payload.visibility not in ("PUBLIC", "PRIVATE", "CIRCLE_ONLY"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
        )

    anchor_id = str(uuid.uuid4())
    tags_json = json.dumps(payload.tags) if payload.tags else None

    db.execute(
        text("""
            INSERT INTO anchors
                (anchor_id, creator_id, title, description, location, altitude,
                 status, visibility, unlock_radius, max_unlock,
                 activation_time, expiration_time, tags)
            VALUES
                (:anchor_id, :creator_id, :title, :description,
                 ST_GeomFromText(:point, 4326), :altitude,
                 'ACTIVE', :visibility, :unlock_radius, :max_unlock,
                 :activation_time, :expiration_time, :tags)
        """),
        {
            "anchor_id": anchor_id,
            "creator_id": user_id,
            "title": payload.title,
            "description": payload.description,
            "point": f"POINT({payload.longitude} {payload.latitude})",
            "altitude": payload.altitude,
            "visibility": payload.visibility,
            "unlock_radius": payload.unlock_radius,
            "max_unlock": payload.max_unlock,
            "activation_time": payload.activation_time,
            "expiration_time": payload.expiration_time,
            "tags": tags_json,
        },
    )
    db.commit()

    row = _get_anchor_by_id(db, anchor_id)
    return _row_to_response(row)
