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
from collections import Counter
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.audit import log_action
from pydantic import BaseModel as PydanticBaseModel

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.anchor import (
    CreateAnchorRequest,
    UpdateAnchorRequest,
    AnchorFilterOption,
    AnchorFilterOptionsResponse,
    AnchorResponse,
)

router = APIRouter(prefix="/anchors", tags=["Anchors"])

VALID_VISIBILITY = {"PUBLIC", "PRIVATE", "CIRCLE_ONLY"}
VALID_ANCHOR_STATUS = {"ACTIVE", "EXPIRED", "LOCKED", "FLAGGED"}
VALID_CONTENT_TYPES = {"TEXT", "FILE", "LINK"}

class VoteRequest(PydanticBaseModel):
    vote: str

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_anchor_by_id(db: Session, anchor_id: str):
    """
    Fetch a single anchor row by its ID.
    Uses ST_X/ST_Y to extract longitude/latitude from the MySQL POINT geometry column.
    Returns None if no anchor is found.
    """
    row = db.execute(
        text("""
            SELECT a.anchor_id, a.creator_id, a.circle_id, a.title, a.description,
                   ST_X(a.location) AS longitude, ST_Y(a.location) AS latitude,
                   a.altitude, a.status, a.visibility, a.unlock_radius,
                   a.max_unlock, a.current_unlock, a.activation_time,
                   a.expiration_time, a.tags, a.is_savable,
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


def _get_circle_for_access(db: Session, circle_id: str, user_id: str):
    return db.execute(
        text("""
            SELECT
                c.circle_id,
                c.owner_id,
                MAX(CASE WHEN cm.user_id = :user_id THEN 1 ELSE 0 END) AS is_member
            FROM circles c
            LEFT JOIN circle_members cm ON cm.circle_id = c.circle_id
            WHERE c.circle_id = :circle_id
            GROUP BY c.circle_id, c.owner_id
        """),
        {"circle_id": circle_id, "user_id": user_id},
    ).fetchone()


def _require_circle_access(db: Session, circle_id: str, user_id: str):
    circle = _get_circle_for_access(db, circle_id, user_id)
    if not circle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Circle not found",
        )
    if circle.owner_id != user_id and not bool(circle.is_member):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this circle",
        )
    return circle


def _resolve_circle_id_for_create(
    db: Session,
    payload: CreateAnchorRequest,
    user_id: str,
) -> Optional[str]:
    if payload.visibility == "CIRCLE_ONLY":
        if not payload.circle_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="circle_id is required when visibility is CIRCLE_ONLY",
            )
        _require_circle_access(db, payload.circle_id, user_id)
        return payload.circle_id

    if payload.circle_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="circle_id can only be set when visibility is CIRCLE_ONLY",
        )
    return None


def _resolve_circle_id_for_update(
    db: Session,
    payload: UpdateAnchorRequest,
    row,
    user_id: str,
) -> Optional[str]:
    target_visibility = payload.visibility if payload.visibility is not None else row.visibility

    if target_visibility == "CIRCLE_ONLY":
        target_circle_id = payload.circle_id if payload.circle_id is not None else row.circle_id
        if not target_circle_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="circle_id is required when visibility is CIRCLE_ONLY",
            )
        _require_circle_access(db, target_circle_id, user_id)
        return target_circle_id

    if payload.circle_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="circle_id can only be set when visibility is CIRCLE_ONLY",
        )
    return None


def _anchor_circle_access_clause(table_alias: str) -> str:
    return f"""
        EXISTS (
            SELECT 1
            FROM circles c
            LEFT JOIN circle_members cm
                ON cm.circle_id = c.circle_id
               AND cm.user_id = :session_user_id
            WHERE c.circle_id = {table_alias}.circle_id
              AND (c.owner_id = :session_user_id OR cm.user_id IS NOT NULL)
        )
    """


def _viewer_can_access_anchor_clause(table_alias: str) -> str:
    return f"""
        AND (
            {table_alias}.creator_id = :session_user_id
            OR {table_alias}.visibility = 'PUBLIC'
            OR (
                {table_alias}.visibility = 'CIRCLE_ONLY'
                AND {table_alias}.circle_id IS NOT NULL
                AND {_anchor_circle_access_clause(table_alias)}
            )
        )
    """


def _require_anchor_view_access(db: Session, row, user_id: str):
    if row.creator_id == user_id or row.visibility == "PUBLIC":
        return
    if row.visibility == "CIRCLE_ONLY" and row.circle_id:
        _require_circle_access(db, row.circle_id, user_id)
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this Anchor",
    )


def _require_location_access(db: Session, user_id: str):
    row = db.execute(
        text("SELECT is_ghost_mode FROM users WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()
    if row and row.is_ghost_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Location features are unavailable while Ghost Mode is enabled.",
        )


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


def _normalize_enum_filter(
    values,
    valid_values: set[str],
    detail: str,
) -> Optional[List[str]]:
    if values is None:
        return None
    if isinstance(values, str):
        values = [values]

    normalized: List[str] = []
    for item in values:
        candidate = item.strip().upper()
        if candidate not in valid_values:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=detail,
            )
        if candidate not in normalized:
            normalized.append(candidate)
    return normalized or None


def _normalize_visibility_filter(visibility) -> Optional[List[str]]:
    return _normalize_enum_filter(
        visibility,
        VALID_VISIBILITY,
        "visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
    )


def _normalize_status_filter(anchor_status) -> Optional[List[str]]:
    return _normalize_enum_filter(
        anchor_status,
        VALID_ANCHOR_STATUS,
        "status must be ACTIVE, EXPIRED, LOCKED, or FLAGGED",
    )


def _normalize_content_type_filter(content_type) -> Optional[List[str]]:
    return _normalize_enum_filter(
        content_type,
        VALID_CONTENT_TYPES,
        "content_type must be one of TEXT, FILE, LINK",
    )


def _normalize_tag_filter(tags) -> Optional[List[str]]:
    if not tags:
        return None
    if isinstance(tags, str):
        tags = [tags]

    normalized: List[str] = []
    for item in tags:
        candidate = item.strip().lower()
        if not candidate:
            continue
        if candidate not in normalized:
            normalized.append(candidate)
    return normalized or None


def _normalize_stored_tags(tags: Optional[List[str]]) -> Optional[List[str]]:
    return _normalize_tag_filter(tags)


def _add_in_clause(
    field_sql: str,
    values: List[str],
    param_prefix: str,
    params: Dict[str, object],
) -> str:
    placeholders: List[str] = []
    for idx, value in enumerate(values):
        key = f"{param_prefix}_{idx}"
        placeholders.append(f":{key}")
        params[key] = value
    return f"{field_sql} IN ({', '.join(placeholders)})"


def _creator_is_not_banned_clause(table_alias: str) -> str:
    return (
        f" AND EXISTS ("
        f"SELECT 1 FROM users creator "
        f"WHERE creator.user_id = {table_alias}.creator_id "
        f"AND creator.is_banned = FALSE)"
    )


def _creator_is_not_blocked_clause(table_alias: str) -> str:
    return (
        f" AND NOT EXISTS ("
        f"SELECT 1 FROM blocked_users bu "
        f"WHERE bu.blocker_id = :session_user_id "
        f"AND bu.blocked_user_id = {table_alias}.creator_id)"
    )


def _build_anchor_filters(
    table_alias: str,
    visibility=None,
    anchor_status=None,
    content_type=None,
    tags=None,
) -> Tuple[str, Dict[str, object]]:
    filters: List[str] = []
    params: Dict[str, object] = {}

    normalized_visibility = _normalize_visibility_filter(visibility)
    if normalized_visibility:
        filters.append(
            _add_in_clause(
                f"{table_alias}.visibility",
                normalized_visibility,
                "visibility",
                params,
            )
        )

    normalized_status = _normalize_status_filter(anchor_status)
    if normalized_status:
        filters.append(
            _add_in_clause(
                f"{table_alias}.status",
                normalized_status,
                "anchor_status",
                params,
            )
        )

    normalized_content_types = _normalize_content_type_filter(content_type)
    if normalized_content_types:
        in_clause = _add_in_clause(
            "c.content_type",
            normalized_content_types,
            "content_type",
            params,
        )
        filters.append(
            f"""
            EXISTS (
                SELECT 1
                FROM Content c
                WHERE c.anchor_id = {table_alias}.anchor_id
                AND {in_clause}
            )
            """
        )

    normalized_tags = _normalize_tag_filter(tags)
    if normalized_tags:
        tag_filters: List[str] = []
        for idx, tag in enumerate(normalized_tags):
            key = f"tag_{idx}"
            params[key] = json.dumps(tag)
            tag_filters.append(
                f"JSON_CONTAINS(COALESCE({table_alias}.tags, JSON_ARRAY()), CAST(:{key} AS JSON), '$')"
            )
        filters.append(f"({' OR '.join(tag_filters)})")

    if not filters:
        return "", params
    return " AND " + " AND ".join(filters), params


def _serialize_filter_counts(
    counter: Counter,
    order: Optional[List[str]] = None,
) -> List[AnchorFilterOption]:
    if order is not None:
        return [
            AnchorFilterOption(value=value, count=counter[value])
            for value in order
            if counter[value] > 0
        ]

    return [
        AnchorFilterOption(value=value, count=count)
        for value, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    ]


def _row_to_response(row, net_votes: int = 0, user_vote: Optional[str] = None) -> AnchorResponse:
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
        is_unlocked=bool(getattr(row, "is_unlocked", False)),
        content_type=content_type,
        tags=tags,
<<<<<<< Updated upstream
        net_votes=int(getattr(row, "net_votes", 0) or 0),
        user_vote=getattr(row, "user_vote", None),
    )
    """
    Convert a raw database row into an AnchorResponse schema object.
    Tags are stored as a JSON string in the DB, so we parse them back into a list.
    """
    tags = _parse_tags(row.tags)
    content_type = _parse_content_types(getattr(row, "content_type", None))
    return AnchorResponse(
        anchor_id=row.anchor_id,
        creator_id=row.creator_id,
        circle_id=getattr(row, "circle_id", None),
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
        is_unlocked=bool(getattr(row, "is_unlocked", False)),
        content_type=content_type,
        tags=tags,
=======
        is_savable=bool(getattr(row, "is_savable", True)),
>>>>>>> Stashed changes
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
    request: Request,
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
    _require_location_access(db, user_id)
    circle_id = _resolve_circle_id_for_create(db, payload, user_id)

    now = datetime.utcnow()
    activation_time = _to_utc_naive(payload.activation_time)
    expiration_time = None if payload.always_active else _to_utc_naive(payload.expiration_time)

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
    normalized_tags = _normalize_stored_tags(payload.tags)
    tags_json = json.dumps(normalized_tags) if normalized_tags else None

    activation_time = activation_time if activation_time is not None else datetime.utcnow()

    db.execute(
        text("""
            INSERT INTO anchors
                (anchor_id, creator_id, circle_id, title, description, location, altitude,
                 status, visibility, unlock_radius, max_unlock,
                 activation_time, expiration_time, tags, is_savable)
            VALUES
                (:anchor_id, :creator_id, :circle_id, :title, :description,
                 ST_GeomFromText(:point, 4326), :altitude,
                 'ACTIVE', :visibility, :unlock_radius, :max_unlock,
                 :activation_time, :expiration_time, :tags, :is_savable)
        """),
        {
            "anchor_id": anchor_id,
            "creator_id": user_id,
            "circle_id": circle_id,
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
            "is_savable": payload.is_savable,
        },
    )
    db.commit()

    # Re-fetch the inserted row to return the full response with all fields
    row = _get_anchor_by_id(db, anchor_id)
    log_action(db, user_id, "ANCHOR_CREATE", target_id=anchor_id, target_type="ANCHOR", request=request)
    return _row_to_response(row)


# ── Update Anchor ─────────────────────────────────────────────────────────────

@router.patch("/{anchor_id}", response_model=AnchorResponse)
def update_anchor(
    anchor_id: str,
    payload: UpdateAnchorRequest,
    request: Request,
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

    if payload.latitude is not None or payload.longitude is not None:
        _require_location_access(db, user_id)

    if payload.visibility is not None and payload.visibility not in VALID_VISIBILITY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="visibility must be PUBLIC, PRIVATE, or CIRCLE_ONLY",
        )
    target_circle_id = _resolve_circle_id_for_update(db, payload, row, user_id)

    now = datetime.utcnow()
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
    if target_circle_id != row.circle_id:
        fields["circle_id"] = target_circle_id
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
        normalized_tags = _normalize_stored_tags(payload.tags)
        fields["tags"] = json.dumps(normalized_tags) if normalized_tags else None

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
    log_action(db, user_id, "ANCHOR_EDIT", target_id=anchor_id, target_type="ANCHOR", request=request)
    return _row_to_response(updated)


# ── Delete Anchor ─────────────────────────────────────────────────────────────

@router.delete("/{anchor_id}", status_code=status.HTTP_200_OK)
def delete_anchor(
    anchor_id: str,
    request: Request,
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
    log_action(db, user_id, "ANCHOR_DELETE", target_id=anchor_id, target_type="ANCHOR", request=request)
    return {"message": "Anchor deleted successfully"}


# ── Unlock Anchor (US11 #3) ───────────────────────────────────────────────────

@router.post("/{anchor_id}/unlock", status_code=status.HTTP_200_OK)
def unlock_anchor(
    anchor_id: str,
    request: Request,
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
    _require_anchor_view_access(db, row, user_id)

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

    log_action(db, user_id, "ANCHOR_UNLOCK", target_id=anchor_id, target_type="ANCHOR", request=request)

    return {
        "message": "Anchor unlocked successfully",
        "anchor_id": anchor_id,
        "unlocks": new_count,
    }


# ── Nearby Anchors (US12 #3) ──────────────────────────────────────────────────

@router.get("/", response_model=List[AnchorResponse])
def get_all_anchors(
    visibility: Optional[List[str]] = Query(None, description="Filter by visibility: PUBLIC, PRIVATE, CIRCLE_ONLY"),
    anchor_status: Optional[List[str]] = Query(None, alias="anchor_status", description="Filter by status: ACTIVE, EXPIRED, LOCKED, FLAGGED"),
    content_type: Optional[List[str]] = Query(None, description="Filter by content type: TEXT, FILE, LINK"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags; matches any selected tag"),
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
        tags=tags,
    )
    filter_params["session_user_id"] = user_id
    filters = (
        _creator_is_not_banned_clause("a")
        + _creator_is_not_blocked_clause("a")
        + _viewer_can_access_anchor_clause("a")
        + filters
    )

    rows = db.execute(
        text(f"""
            SELECT
                a.anchor_id, a.creator_id, a.circle_id, a.title, a.description,
                ST_X(a.location) AS longitude, ST_Y(a.location) AS latitude,
                a.altitude, a.status, a.visibility, a.unlock_radius,
                a.max_unlock, a.current_unlock, a.activation_time,
                a.expiration_time, a.tags, a.is_savable,
                (
                    SELECT GROUP_CONCAT(DISTINCT c.content_type ORDER BY c.content_type SEPARATOR ',')
                    FROM Content c
                    WHERE c.anchor_id = a.anchor_id
                ) AS content_type, 
             COALESCE((
    SELECT SUM(CASE WHEN vote = 'UPVOTE' THEN 1 ELSE -1 END)
    FROM anchor_votes av
    WHERE av.anchor_id = a.anchor_id
), 0) AS net_votes,
(
    SELECT vote FROM anchor_votes av
    WHERE av.anchor_id = a.anchor_id AND av.user_id = :session_user_id
    LIMIT 1
) AS user_vote,
            FROM anchors a
            WHERE 1 = 1
            {filters}
            ORDER BY a.activation_time DESC
        """),
        filter_params,
    ).fetchall()

    results = [_row_to_response(row) for row in rows]

    return results


@router.get("/nearby/filter-options", response_model=AnchorFilterOptionsResponse)
def get_nearby_anchor_filter_options(
    lat: float = Query(..., description="User's current latitude"),
    lon: float = Query(..., description="User's current longitude"),
    radius_km: float = Query(5.0, description="Search radius in kilometers"),
    visibility: Optional[List[str]] = Query(None, description="Filter by visibility: PUBLIC, PRIVATE, CIRCLE_ONLY"),
    anchor_status: Optional[List[str]] = Query(None, alias="anchor_status", description="Filter by status: ACTIVE, EXPIRED, LOCKED, FLAGGED"),
    content_type: Optional[List[str]] = Query(None, description="Filter by content type: TEXT, FILE, LINK"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags; matches any selected tag"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Return available nearby filter options with counts for the current search area.
    Uses the same base location and active-window constraints as nearby discovery.
    """
    _require_location_access(db, user_id)

    params = {
        "radius_m": radius_km * 1000,
        "user_point": f"POINT({lon} {lat})",
        "session_user_id": user_id,
    }
    filters = """
        AND (a.activation_time IS NULL OR a.activation_time <= UTC_TIMESTAMP())
        AND (a.expiration_time IS NULL OR a.expiration_time >= UTC_TIMESTAMP())
    """
    filters += _creator_is_not_banned_clause("a")
    filters += _creator_is_not_blocked_clause("a")
    filters += _viewer_can_access_anchor_clause("a")
    extra_filters, extra_params = _build_anchor_filters(
        table_alias="a",
        visibility=visibility,
        anchor_status=anchor_status,
        content_type=content_type,
        tags=tags,
    )
    filters += extra_filters
    params.update(extra_params)

    rows = db.execute(
        text(f"""
            SELECT
                a.status,
                a.visibility,
                a.tags,
                (
                    SELECT GROUP_CONCAT(DISTINCT c.content_type ORDER BY c.content_type SEPARATOR ',')
                    FROM Content c
                    WHERE c.anchor_id = a.anchor_id
                ) AS content_type
            FROM anchors a
            WHERE ST_Distance_Sphere(
                a.location,
                ST_GeomFromText(:user_point, 4326)
            ) <= :radius_m
            {filters}
        """),
        params,
    ).fetchall()

    visibility_counts: Counter = Counter()
    status_counts: Counter = Counter()
    content_type_counts: Counter = Counter()
    tag_counts: Counter = Counter()

    for row in rows:
        visibility_counts[row.visibility] += 1
        status_counts[row.status] += 1
        for item in _parse_content_types(getattr(row, "content_type", None)) or []:
            content_type_counts[item] += 1
        for tag in _parse_tags(row.tags) or []:
            normalized_tag = tag.strip().lower()
            if normalized_tag:
                tag_counts[normalized_tag] += 1

    return AnchorFilterOptionsResponse(
        visibility=_serialize_filter_counts(
            visibility_counts,
            order=["PUBLIC", "CIRCLE_ONLY", "PRIVATE"],
        ),
        anchor_status=_serialize_filter_counts(
            status_counts,
            order=["ACTIVE", "LOCKED", "EXPIRED", "FLAGGED"],
        ),
        content_type=_serialize_filter_counts(
            content_type_counts,
            order=["TEXT", "FILE", "LINK"],
        ),
        tags=_serialize_filter_counts(tag_counts),
    )


@router.get("/nearby", response_model=List[AnchorResponse])
def get_nearby_anchors(
    lat: float = Query(..., description="User's current latitude"),
    lon: float = Query(..., description="User's current longitude"),
    radius_km: float = Query(5.0, description="Search radius in kilometers"),
    visibility: Optional[List[str]] = Query(None, description="Filter by visibility: PUBLIC, PRIVATE, CIRCLE_ONLY"),
    # Named anchor_status (not status) to avoid shadowing fastapi.status module
    anchor_status: Optional[List[str]] = Query(None, alias="anchor_status", description="Filter by status: ACTIVE, EXPIRED, LOCKED, FLAGGED"),
    content_type: Optional[List[str]] = Query(None, description="Filter by content type: TEXT, FILE, LINK"),
    tags: Optional[List[str]] = Query(None, description="Filter by tags; matches any selected tag"),
    sort_by: str = Query("distance", description="Sort by: distance or created_at"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    US12 #3 — Get nearby anchors sorted by distance with optional filters.
    Uses MySQL ST_Distance_Sphere for accurate great-circle distance in meters.
    Filters are appended dynamically to the WHERE clause only if provided.
    """
    _require_location_access(db, user_id)

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
        "session_user_id": user_id,
    }

    # Always return only anchors active for the current time window.
    # Null activation_time means "active immediately";
    # null expiration_time means "no end time" (always active).
    filters += """
        AND (a.activation_time IS NULL OR a.activation_time <= UTC_TIMESTAMP())
        AND (a.expiration_time IS NULL OR a.expiration_time >= UTC_TIMESTAMP())
    """
    filters += _creator_is_not_banned_clause("a")
    filters += _creator_is_not_blocked_clause("a")
    filters += _viewer_can_access_anchor_clause("a")

    extra_filters, extra_params = _build_anchor_filters(
        table_alias="a",
        visibility=visibility,
        anchor_status=anchor_status,
        content_type=content_type,
        tags=tags,
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
                a.circle_id,
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
                a.is_savable,
                (
                    SELECT GROUP_CONCAT(DISTINCT c.content_type ORDER BY c.content_type SEPARATOR ',')
                    FROM Content c
                    WHERE c.anchor_id = a.anchor_id
                ) AS content_type,
             COALESCE((
    SELECT SUM(CASE WHEN vote = 'UPVOTE' THEN 1 ELSE -1 END)
    FROM anchor_votes av
    WHERE av.anchor_id = a.anchor_id
), 0) AS net_votes,
(
    SELECT vote FROM anchor_votes av
    WHERE av.anchor_id = a.anchor_id AND av.user_id = :session_user_id
    LIMIT 1
) AS user_vote,
                -- Only unlocked if creator OR currently within radius
                (a.creator_id = :session_user_id OR ST_Distance_Sphere(a.location, ST_GeomFromText(:user_point, 4326)) <= a.unlock_radius) AS is_unlocked,
                -- Track if previously unlocked to handle count increments correctly
                (ua.anchor_id IS NOT NULL) AS has_previously_unlocked,
                -- Calculate distance in meters from user's position to each anchor
                ST_Distance_Sphere(
                    a.location,
                    ST_GeomFromText(:user_point, 4326)
                ) AS distance_m
            FROM anchors a
            LEFT JOIN unlocked_anchors ua 
                ON a.anchor_id = ua.anchor_id AND ua.user_id = :session_user_id
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
        is_unlocked = bool(row.is_unlocked)
        is_creator = row.creator_id == user_id
        
        # Auto-unlock logic (track unique unlocks and increment counts)
        if is_unlocked and not is_creator and not bool(row.has_previously_unlocked) and row.status == 'ACTIVE':
            try:
                # 1. Insert into tracking table to mark as "once visited"
                db.execute(
                    text("INSERT INTO unlocked_anchors (user_id, anchor_id) VALUES (:user_id, :anchor_id)"),
                    {"user_id": user_id, "anchor_id": row.anchor_id}
                )
                
                # 2. Increment global unlock count
                db.execute(
                    text("UPDATE anchors SET current_unlock = current_unlock + 1 WHERE anchor_id = :anchor_id"),
                    {"user_id": user_id, "anchor_id": row.anchor_id}
                )
                
                # 3. Check max auto-expire immediately
                if row.max_unlock is not None and (row.current_unlock + 1) >= row.max_unlock:
                    db.execute(
                        text("UPDATE anchors SET status = 'EXPIRED' WHERE anchor_id = :anchor_id"),
                        {"anchor_id": row.anchor_id}
                    )
                
                db.commit()
                is_unlocked = True
                
                # We artificially increment the count in the response so the UI is up to date immediately
                row_dict = dict(row._mapping)
                row_dict["current_unlock"] += 1
                if row.max_unlock is not None and row_dict["current_unlock"] >= row.max_unlock:
                    row_dict["status"] = "EXPIRED"
                
                # Use a dummy object to pass to _row_to_response
                class DynamicRow:
                    def __init__(self, **entries):
                        self.__dict__.update(entries)
                
                row_obj = DynamicRow(**row_dict)
                row_obj.is_unlocked = True
                results.append(_row_to_response(row_obj))
                continue
                
            except Exception:
                db.rollback()
                # If race condition or unique constraint fails, just ignore
                pass
                
        results.append(_row_to_response(row))

    return results

# ── Vote on Anchor (US9) ──────────────────────────────────────────────────────

@router.post("/{anchor_id}/vote", status_code=status.HTTP_200_OK)
def vote_anchor(
    anchor_id: str,
    payload: VoteRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    US9 Task 1 — Upvote or downvote an anchor.
    One vote per user per anchor — voting again with the same value removes the vote.
    Voting with the opposite value switches the vote.
    Anchor creator cannot vote on their own anchor.
    """
    if payload.vote not in ("UPVOTE", "DOWNVOTE"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="vote must be UPVOTE or DOWNVOTE",
        )

    row = _get_anchor_by_id(db, anchor_id)
    if not row:
        raise HTTPException(status_code=404, detail="Anchor not found")

    if row.creator_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot vote on your own anchor",
        )

    existing = db.execute(
        text("""
            SELECT vote FROM anchor_votes
            WHERE anchor_id = :anchor_id AND user_id = :user_id
        """),
        {"anchor_id": anchor_id, "user_id": user_id},
    ).fetchone()

    if existing:
        if existing.vote == payload.vote:
            # Same vote — remove it (toggle off)
            db.execute(
                text("""
                    DELETE FROM anchor_votes
                    WHERE anchor_id = :anchor_id AND user_id = :user_id
                """),
                {"anchor_id": anchor_id, "user_id": user_id},
            )
            user_vote = None
        else:
            # Different vote — switch it
            db.execute(
                text("""
                    UPDATE anchor_votes SET vote = :vote, voted_at = NOW()
                    WHERE anchor_id = :anchor_id AND user_id = :user_id
                """),
                {"vote": payload.vote, "anchor_id": anchor_id, "user_id": user_id},
            )
            user_vote = payload.vote
    else:
        # New vote
        db.execute(
            text("""
                INSERT INTO anchor_votes (anchor_id, user_id, vote)
                VALUES (:anchor_id, :user_id, :vote)
            """),
            {"anchor_id": anchor_id, "user_id": user_id, "vote": payload.vote},
        )
        user_vote = payload.vote

    db.commit()

    net_votes = db.execute(
        text("""
            SELECT
                SUM(CASE WHEN vote = 'UPVOTE' THEN 1 ELSE -1 END) AS net
            FROM anchor_votes
            WHERE anchor_id = :anchor_id
        """),
        {"anchor_id": anchor_id},
    ).fetchone()

    return {
        "message": "Vote recorded",
        "anchor_id": anchor_id,
        "net_votes": int(net_votes.net) if net_votes.net is not None else 0,
        "user_vote": user_vote,
    }
