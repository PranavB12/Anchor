"""
US5 #1 — Anchor Creation API
US9 #1 — Anchor Edit and Delete API
US11 #3 - Prevent unlocking outside of activation window

Endpoints:
    POST   /anchors             — create a new Anchor tied to a location
    PATCH  /anchors/{anchor_id} — update an existing Anchor (owner only)
    DELETE /anchors/{anchor_id} — delete an Anchor (owner only)
    POST   /anchors/{anchor_id}/unlock — unlock an Anchor (checks activation window)
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.anchor import CreateAnchorRequest, UpdateAnchorRequest, AnchorResponse

from datetime import datetime

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

# ── US11 ───────────────────────────────────────────────────────────────────────
@router.post("/{anchor_id}/unlock", status_code=status.HTTP_200_OK)
def unlock_anchor(
    anchor_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    US11 #3 — Attempt to unlock an Anchor.
    Checks:
      1. Anchor exists
      2. Anchor is ACTIVE
      3. Current time is within activation_time and expiration_time window
      4. Unlock count has not exceeded max_unlock
    """
    row = _get_anchor_by_id(db, anchor_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor not found",
        )

    # Check anchor is active
    if row.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Anchor is not active (status: {row.status})",
        )

    now = datetime.utcnow();

    # Check activation window — if activation_time is set, must be after it
    if row.activation_time and now < row.activation_time:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Anchor is not yet active. Opens at {row.activation_time} UTC",
        )

    # Check expiration — if expiration_time is set, must be before it
    if row.expiration_time and now > row.expiration_time:
        # Mark anchor as expired
        db.execute(
            text("UPDATE anchors SET status = 'EXPIRED' WHERE anchor_id = :anchor_id"),
            {"anchor_id": anchor_id},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anchor has expired",
        )

    # Check max unlock count
    if row.max_unlock is not None and row.current_unlock >= row.max_unlock:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anchor has reached its maximum number of unlocks",
        )

    # All checks passed — increment unlock count
    db.execute(
        text("""
            UPDATE anchors
            SET current_unlock = current_unlock + 1
            WHERE anchor_id = :anchor_id
        """),
        {"anchor_id": anchor_id},
    )
    db.commit()

    return {
        "message": "Anchor unlocked successfully",
        "anchor_id": anchor_id,
        "unlocks": row.current_unlock + 1,
    }

# ── Nearby Anchors (US12 #3) ──────────────────────────────────────────────────

from typing import Optional, List
from fastapi import Query
from app.schemas.anchor import AnchorResponse

@router.get("/nearby", response_model=List[AnchorResponse])
def get_nearby_anchors(
    lat: float = Query(..., description="User's current latitude"),
    lon: float = Query(..., description="User's current longitude"),
    radius_km: float = Query(5.0, description="Search radius in kilometers"),
    visibility: Optional[str] = Query(None, description="Filter by visibility: PUBLIC, PRIVATE, CIRCLE_ONLY"),
    status: Optional[str] = Query(None, description="Filter by status: ACTIVE, EXPIRED, LOCKED, FLAGGED"),
    sort_by: str = Query("distance", description="Sort by: distance or created_at"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    US12 #3 — Get nearby anchors sorted by distance with optional filters.
    Uses MySQL ST_Distance_Sphere for accurate distance calculation.
    """

    # Build optional filter clauses
    filters = ""
    params = {
        "lat": lat,
        "lon": lon,
        "radius_m": radius_km * 1000,
    }

    if visibility:
        if visibility not in ("PUBLIC", "PRIVATE", "CIRCLE_ONLY"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
            )
        filters += " AND a.visibility = :visibility"
        params["visibility"] = visibility

    if status:
        if status not in ("ACTIVE", "EXPIRED", "LOCKED", "FLAGGED"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status must be ACTIVE, EXPIRED, LOCKED, or FLAGGED",
            )
        filters += " AND a.status = :status"
        params["status"] = status

    # Sort clause
    order_clause = "distance_m ASC" if sort_by == "distance" else "a.anchor_id DESC"

    rows = db.execute(
        text(f"""
            SELECT
                a.anchor_id,
                a.creator_id,
                a.title,
                a.description,
                ST_X(a.location) AS longitude,
                ST_Y(a.location) AS latitude,
                a.altitude,
                a.status,
                a.visibility,
                a.unlock_radius,
                a.max_unlock,
                a.current_unlock,
                a.activation_time,
                a.expiration_time,
                a.tags,
                ST_Distance_Sphere(
                    a.location,
                    ST_GeomFromText(:user_point, 4326)
                ) AS distance_m
            FROM anchors a
            WHERE ST_Distance_Sphere(
                a.location,
                ST_GeomFromText(:user_point, 4326)
            ) <= :radius_m
            {filters}
            ORDER BY {order_clause}
        """),
        {**params, "user_point": f"POINT({lon} {lat})"},
    ).fetchall()

    results = []
    for row in rows:
        tags = row.tags
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except Exception:
                tags = []
        results.append(AnchorResponse(
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
        ))

    return results




