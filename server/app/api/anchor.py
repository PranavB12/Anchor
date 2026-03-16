"""
US5 #1 — Anchor Creation API
US9 #1 — Anchor Edit and Delete API
US11 #3 — Prevent unlocking outside activation window
US12 #3 — Sort by distance, filter locked/unlocked, public/private

Endpoints:
    POST   /anchors                    — create a new Anchor tied to a location
    GET    /anchors/nearby             — list nearby anchors sorted by distance with filters
    PATCH  /anchors/{anchor_id}        — update an existing Anchor (owner only)
    DELETE /anchors/{anchor_id}        — delete an Anchor (owner only)
    POST   /anchors/{anchor_id}/unlock — unlock an Anchor (checks activation window)
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.anchor import CreateAnchorRequest, UpdateAnchorRequest, AnchorResponse

router = APIRouter(prefix="/anchors", tags=["Anchors"])

VALID_VISIBILITY = {"PUBLIC", "PRIVATE", "CIRCLE_ONLY"}
VALID_ANCHOR_STATUS = {"ACTIVE", "EXPIRED", "LOCKED", "FLAGGED"}
VALID_CONTENT_TYPES = {"TEXT", "FILE", "LINK"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_anchor_by_id(db: Session, anchor_id: str):
    """
    Fetch a single anchor row by its ID.
    Uses ST_X/ST_Y to extract longitude/latitude from the MySQL POINT geometry column.
    Returns None if no anchor is found.
    """
    row = db.execute(
        text("""
            SELECT a.anchor_id, a.creator_id, a.title, a.description,
                   ST_X(a.location) AS longitude, ST_Y(a.location) AS latitude,
                   a.altitude, a.status, a.visibility, a.unlock_radius,
                   a.max_unlock, a.current_unlock, a.activation_time,
                   a.expiration_time, a.tags,
                   (
                       SELECT GROUP_CONCAT(DISTINCT c.content_type ORDER BY c.content_type SEPARATOR ',')
                       FROM Content c
                       WHERE c.anchor_id = a.anchor_id
                   ) AS content_type
            FROM anchors a
            WHERE a.anchor_id = :anchor_id
        """),
        {"anchor_id": anchor_id},
    ).fetchone()
    return row


def _parse_tags(raw_tags) -> Optional[List[str]]:
    if isinstance(raw_tags, str):
        try:
            parsed = json.loads(raw_tags)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return raw_tags


def _parse_content_types(raw_content_type) -> Optional[List[str]]:
    if raw_content_type is None:
        return None
    if isinstance(raw_content_type, str):
        parsed = [value.strip() for value in raw_content_type.split(",") if value.strip()]
        return parsed or None
    if isinstance(raw_content_type, list):
        return raw_content_type or None
    return None


def _normalize_visibility_filter(visibility: Optional[str]) -> Optional[str]:
    if visibility is None:
        return None
    normalized = visibility.strip().upper()
    if normalized not in VALID_VISIBILITY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
        )
    return normalized


def _normalize_status_filter(anchor_status: Optional[str]) -> Optional[str]:
    if anchor_status is None:
        return None
    normalized = anchor_status.strip().upper()
    if normalized not in VALID_ANCHOR_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be ACTIVE, EXPIRED, LOCKED, or FLAGGED",
        )
    return normalized


def _normalize_content_type_filter(content_type: Optional[List[str]]) -> Optional[List[str]]:
    if not content_type:
        return None

    normalized: List[str] = []
    for item in content_type:
        candidate = item.strip().upper()
        if candidate not in VALID_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="content_type must be one of TEXT, FILE, LINK",
            )
        if candidate not in normalized:
            normalized.append(candidate)
    return normalized or None


def _build_anchor_filters(
    table_alias: str,
    visibility: Optional[str] = None,
    anchor_status: Optional[str] = None,
    content_type: Optional[List[str]] = None,
) -> Tuple[str, Dict[str, object]]:
    filters: List[str] = []
    params: Dict[str, object] = {}

    normalized_visibility = _normalize_visibility_filter(visibility)
    if normalized_visibility:
        filters.append(f"{table_alias}.visibility = :visibility")
        params["visibility"] = normalized_visibility

    normalized_status = _normalize_status_filter(anchor_status)
    if normalized_status:
        filters.append(f"{table_alias}.status = :anchor_status")
        params["anchor_status"] = normalized_status

    normalized_content_types = _normalize_content_type_filter(content_type)
    if normalized_content_types:
        placeholders: List[str] = []
        for idx, item in enumerate(normalized_content_types):
            key = f"content_type_{idx}"
            placeholders.append(f":{key}")
            params[key] = item
        filters.append(
            f"""
            EXISTS (
                SELECT 1
                FROM Content c
                WHERE c.anchor_id = {table_alias}.anchor_id
                AND c.content_type IN ({", ".join(placeholders)})
            )
            """
        )

    if not filters:
        return "", params
    return " AND " + " AND ".join(filters), params


def _row_to_response(row) -> AnchorResponse:
    """
    Convert a raw database row into an AnchorResponse schema object.
    Tags are stored as a JSON string in the DB, so we parse them back into a list.
    """
    tags = _parse_tags(row.tags)
    content_type = _parse_content_types(getattr(row, "content_type", None))
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
        always_active=row.expiration_time is None,
        content_type=content_type,
        tags=tags,
    )


def _to_utc_naive(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Normalize incoming datetimes so anchor creation can keep using naive UTC comparisons.
    - Aware datetime: convert to UTC, then strip tzinfo.
    - Naive datetime: keep as-is.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


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
    Location is stored as a MySQL POINT geometry using ST_GeomFromText with SRID 4326 (WGS84).
    Tags are serialized to JSON for storage.
    """
    if payload.visibility not in VALID_VISIBILITY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
        )

    now = datetime.utcnow()
    activation_time = _to_utc_naive(payload.activation_time)
    expiration_time = None if payload.always_active else _to_utc_naive(payload.expiration_time)

    if activation_time and activation_time < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="activation_time cannot be in the past",
        )
    if expiration_time and expiration_time < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expiration_time cannot be in the past",
        )
    if activation_time and expiration_time and expiration_time <= activation_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expiration_time must be after activation_time",
        )

    anchor_id = str(uuid.uuid4())
    # Serialize tags list to JSON string for DB storage, or None if no tags provided
    tags_json = json.dumps(payload.tags) if payload.tags else None

    activation_time = activation_time if activation_time is not None else datetime.utcnow()

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
            # MySQL POINT format is POINT(longitude latitude) — note lon comes first
            "point": f"POINT({payload.longitude} {payload.latitude})",
            "altitude": payload.altitude,
            "visibility": payload.visibility,
            "unlock_radius": payload.unlock_radius,
            "max_unlock": payload.max_unlock,
            "activation_time": activation_time,
            "expiration_time": expiration_time,
            "tags": tags_json,
        },
    )
    db.commit()

    # Re-fetch the inserted row to return the full response with all fields
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
    Only provided (non-None) fields are updated — partial updates are supported.
    Location is updated only if latitude or longitude is provided.
    """
    row = _get_anchor_by_id(db, anchor_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor not found",
        )
    # Ensure only the creator can modify this anchor
    if row.creator_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this Anchor",
        )

    if payload.visibility is not None and payload.visibility not in VALID_VISIBILITY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
        )

    now = datetime.utcnow()
    if payload.activation_time is not None and payload.activation_time < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="activation_time cannot be in the past",
        )
    if payload.expiration_time is not None and payload.expiration_time < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expiration_time cannot be in the past",
        )

    # Resolve what the effective activation/expiration will be after this update,
    # using the incoming payload value if provided, otherwise falling back to the
    # existing DB value. This is needed to validate the window before writing anything.
    effective_activation = (
        payload.activation_time if payload.activation_time is not None else row.activation_time
    )
    # If always_active is being set to True, clear expiration regardless of what was sent.
    # Otherwise use the new expiration_time if provided, or keep the existing one.
    if payload.always_active is True:
        effective_expiration = None
    elif payload.expiration_time is not None:
        effective_expiration = payload.expiration_time
    else:
        effective_expiration = row.expiration_time

    # Validate the resolved window — expiration must come after activation
    if effective_activation and effective_expiration and effective_expiration <= effective_activation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="expiration_time must be after activation_time",
        )

    # Build a dict of only the fields that were actually provided.
    # None values are skipped so unmentioned fields are left unchanged in the DB.
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
    # always_active=True explicitly clears expiration_time in the DB
    if payload.always_active is True:
        fields["expiration_time"] = None
    elif payload.expiration_time is not None:
        fields["expiration_time"] = payload.expiration_time
    if payload.tags is not None:
        fields["tags"] = json.dumps(payload.tags)

    # Handle partial location update — if only lat or only lon is provided,
    # fall back to the existing value for the other coordinate
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
    Returns a success message on deletion.
    """
    row = _get_anchor_by_id(db, anchor_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor not found",
        )
    # Ensure only the creator can delete this anchor
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


# ── Unlock Anchor (US11 #3) ───────────────────────────────────────────────────

@router.post("/{anchor_id}/unlock", status_code=status.HTTP_200_OK)
def unlock_anchor(
    anchor_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    US11 #3 — Attempt to unlock an Anchor.
    Checks (in order):
      1. Anchor exists
      2. Anchor status is ACTIVE
      3. Current time is after activation_time (if set)
      4. Current time is before expiration_time (if set) — auto-expires if past
      5. Unlock count has not exceeded max_unlock — auto-expires if reached
    On success, increments current_unlock counter.
    """
    row = _get_anchor_by_id(db, anchor_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anchor not found",
        )

    # Anchor must be in ACTIVE status to be unlocked
    if row.status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Anchor is not active (status: {row.status})",
        )

    now = datetime.utcnow()

    # If activation_time is set, block unlocking before that time
    if row.activation_time and now < row.activation_time:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Anchor is not yet active. Opens at {row.activation_time} UTC",
        )

    # If expiration_time is set and we're past it, auto-mark as EXPIRED and block
    if row.expiration_time and now > row.expiration_time:
        db.execute(
            text("UPDATE anchors SET status = 'EXPIRED' WHERE anchor_id = :anchor_id"),
            {"anchor_id": anchor_id},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anchor has expired",
        )

    # If max_unlock is set and already reached, auto-mark as EXPIRED and block
    if row.max_unlock is not None and row.current_unlock >= row.max_unlock:
        db.execute(
            text("UPDATE anchors SET status = 'EXPIRED' WHERE anchor_id = :anchor_id"),
            {"anchor_id": anchor_id},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anchor has reached its maximum number of unlocks",
        )

    # All checks passed — increment the unlock counter
    db.execute(
        text("""
            UPDATE anchors
            SET current_unlock = current_unlock + 1
            WHERE anchor_id = :anchor_id
        """),
        {"anchor_id": anchor_id},
    )
    db.commit()

    new_count = row.current_unlock + 1

    # If this was the final allowed unlock, mark anchor as EXPIRED
    if row.max_unlock is not None and new_count >= row.max_unlock:
        db.execute(
            text("UPDATE anchors SET status = 'EXPIRED' WHERE anchor_id = :anchor_id"),
            {"anchor_id": anchor_id},
        )
        db.commit()

    return {
        "message": "Anchor unlocked successfully",
        "anchor_id": anchor_id,
        "unlocks": new_count,
    }


# ── Nearby Anchors (US12 #3) ──────────────────────────────────────────────────

@router.get("/", response_model=List[AnchorResponse])
def get_all_anchors(
    visibility: Optional[str] = Query(None, description="Filter by visibility: PUBLIC, PRIVATE, CIRCLE_ONLY"),
    anchor_status: Optional[str] = Query(None, alias="anchor_status", description="Filter by status: ACTIVE, EXPIRED, LOCKED, FLAGGED"),
    content_type: Optional[List[str]] = Query(None, description="Filter by content type: TEXT, FILE, LINK"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    US12 #5 — Return all anchors in the database.
    No location filtering — used when the caller wants a full list regardless of proximity.
    Results are ordered by creation time descending (newest first).
    """
    filters, filter_params = _build_anchor_filters(
        table_alias="a",
        visibility=visibility,
        anchor_status=anchor_status,
        content_type=content_type,
    )

    rows = db.execute(
        text(f"""
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
                ) AS content_type
            FROM anchors a
            WHERE 1 = 1
            {filters}
            ORDER BY a.activation_time DESC
        """),
        filter_params,
    ).fetchall()

    results = [_row_to_response(row) for row in rows]

    return results


@router.get("/nearby", response_model=List[AnchorResponse])
def get_nearby_anchors(
    lat: float = Query(..., description="User's current latitude"),
    lon: float = Query(..., description="User's current longitude"),
    radius_km: float = Query(5.0, description="Search radius in kilometers"),
    visibility: Optional[str] = Query(None, description="Filter by visibility: PUBLIC, PRIVATE, CIRCLE_ONLY"),
    # Named anchor_status (not status) to avoid shadowing fastapi.status module
    anchor_status: Optional[str] = Query(None, alias="anchor_status", description="Filter by status: ACTIVE, EXPIRED, LOCKED, FLAGGED"),
    content_type: Optional[List[str]] = Query(None, description="Filter by content type: TEXT, FILE, LINK"),
    sort_by: str = Query("distance", description="Sort by: distance or created_at"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    US12 #3 — Get nearby anchors sorted by distance with optional filters.
    Uses MySQL ST_Distance_Sphere for accurate great-circle distance in meters.
    Filters are appended dynamically to the WHERE clause only if provided.
    """

    # Mark passed anchors as EXPIRED before retrieving
    db.execute(
        text("UPDATE anchors SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expiration_time <= :now"),
        {"now": datetime.utcnow()}
    )
    db.commit()

    # Start with base params; filters string is built up conditionally below
    filters = ""
    params = {
        "lat": lat,
        "lon": lon,
        "radius_m": radius_km * 1000,  # Convert km to meters for ST_Distance_Sphere
    }

    # Always return only anchors active for the current time window.
    # Null activation_time means "active immediately";
    # null expiration_time means "no end time" (always active).
    filters += """
        AND (a.activation_time IS NULL OR a.activation_time <= UTC_TIMESTAMP())
        AND (a.expiration_time IS NULL OR a.expiration_time >= UTC_TIMESTAMP())
    """

    extra_filters, extra_params = _build_anchor_filters(
        table_alias="a",
        visibility=visibility,
        anchor_status=anchor_status,
        content_type=content_type,
    )
    filters += extra_filters
    params.update(extra_params)

    # Default sort is by distance ascending; fallback sorts by anchor_id (insertion order)
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
                (
                    SELECT GROUP_CONCAT(DISTINCT c.content_type ORDER BY c.content_type SEPARATOR ',')
                    FROM Content c
                    WHERE c.anchor_id = a.anchor_id
                ) AS content_type,
                -- Calculate distance in meters from user's position to each anchor
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

    results = [_row_to_response(row) for row in rows]

    return results
