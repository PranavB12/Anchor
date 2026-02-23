"""
US5 #1 — Anchor Creation API
US9 #1 — Anchor Edit and Delete API

Endpoints:
    POST   /anchors             — create a new Anchor tied to a location
    PATCH  /anchors/{anchor_id} — update an existing Anchor (owner only)
    DELETE /anchors/{anchor_id} — delete an Anchor (owner only)
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.anchor import CreateAnchorRequest, UpdateAnchorRequest, AnchorResponse

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


# ── Update Anchor ─────────────────────────────────────────────────────────────

@router.patch("/{anchor_id}", response_model=AnchorResponse)
def update_anchor(
    anchor_id: str,
    payload: UpdateAnchorRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Update an existing Anchor. Only the creator can edit.
    Only provided (non-None) fields are updated.
    """
    row = _get_anchor_by_id(db, anchor_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor not found",
        )
    if row.creator_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this Anchor",
        )

    if payload.visibility is not None and payload.visibility not in (
        "PUBLIC", "PRIVATE", "CIRCLE_ONLY",
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
        )

    # Build dynamic SET clause from provided fields
    fields = {}
    if payload.title is not None:
        fields["title"] = payload.title
    if payload.description is not None:
        fields["description"] = payload.description
    if payload.visibility is not None:
        fields["visibility"] = payload.visibility
    if payload.unlock_radius is not None:
        fields["unlock_radius"] = payload.unlock_radius
    if payload.max_unlock is not None:
        fields["max_unlock"] = payload.max_unlock
    if payload.altitude is not None:
        fields["altitude"] = payload.altitude
    if payload.activation_time is not None:
        fields["activation_time"] = payload.activation_time
    if payload.expiration_time is not None:
        fields["expiration_time"] = payload.expiration_time
    if payload.tags is not None:
        fields["tags"] = json.dumps(payload.tags)

    # Handle location update — need both lat and lon together
    location_update = ""
    if payload.latitude is not None or payload.longitude is not None:
        new_lat = payload.latitude if payload.latitude is not None else row.latitude
        new_lon = payload.longitude if payload.longitude is not None else row.longitude
        location_update = f", location = ST_GeomFromText('POINT({new_lon} {new_lat})', 4326)"

    if fields or location_update:
        set_clause = ", ".join(f"{k} = :{k}" for k in fields)
        if set_clause and location_update:
            set_clause += location_update
        elif location_update:
            set_clause = location_update.lstrip(", ")

        fields["anchor_id"] = anchor_id
        db.execute(
            text(f"UPDATE anchors SET {set_clause} WHERE anchor_id = :anchor_id"),
            fields,
        )
        db.commit()

    updated = _get_anchor_by_id(db, anchor_id)
    return _row_to_response(updated)


# ── Delete Anchor ─────────────────────────────────────────────────────────────

@router.delete("/{anchor_id}", status_code=status.HTTP_200_OK)
def delete_anchor(
    anchor_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Delete an Anchor. Only the creator can delete.
    """
    row = _get_anchor_by_id(db, anchor_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor not found",
        )
    if row.creator_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this Anchor",
        )

    db.execute(
        text("DELETE FROM anchors WHERE anchor_id = :anchor_id"),
        {"anchor_id": anchor_id},
    )
    db.commit()
    return {"message": "Anchor deleted successfully"}
