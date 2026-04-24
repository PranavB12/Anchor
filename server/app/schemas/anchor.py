"""
Pydantic schemas for Anchor request validation and API responses.

CreateAnchorRequest  — validates incoming fields when creating a new anchor.
UpdateAnchorRequest  — all fields optional for partial PATCH updates.
AnchorResponse       — shape of anchor data returned by all endpoints.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CreateAnchorRequest(BaseModel):
    """Fields required (or optional) when dropping a new Anchor."""
    title: str = Field(max_length=255)
    description: Optional[str] = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: Optional[float] = None
    visibility: str = Field(description="PUBLIC, PRIVATE, or CIRCLE_ONLY")
    circle_id: Optional[str] = None
    # unlock_radius is clamped to 10–100 m; defaults to 50 m
    unlock_radius: int = Field(default=50, ge=10, le=100)
    # max_unlock=None means unlimited unlocks
    max_unlock: Optional[int] = None
    activation_time: Optional[datetime] = None
    # expiration_time is ignored when always_active=True
    expiration_time: Optional[datetime] = None
    always_active: bool = False
    tags: Optional[List[str]] = None
    # When False, other users cannot save this anchor to their personal library.
    is_savable: bool = True


class UpdateAnchorRequest(BaseModel):
    """Partial update schema — only provided fields are written to the database."""
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    altitude: Optional[float] = None
    visibility: Optional[str] = None
    circle_id: Optional[str] = None
    unlock_radius: Optional[int] = Field(default=None, ge=10, le=100)
    max_unlock: Optional[int] = None
    activation_time: Optional[datetime] = None
    expiration_time: Optional[datetime] = None
    always_active: Optional[bool] = None
    tags: Optional[List[str]] = None
    is_savable: Optional[bool] = None


class AnchorResponse(BaseModel):
    """Shape of anchor data returned by all endpoints."""
    anchor_id: str
    creator_id: str
    title: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    circle_id: Optional[str] = None
    # status reflects lifecycle: ACTIVE, EXPIRED, LOCKED, or FLAGGED
    status: str
    visibility: str
    unlock_radius: int
    max_unlock: Optional[int] = None
    current_unlock: int
    activation_time: Optional[datetime] = None
    expiration_time: Optional[datetime] = None
    # always_active=True means the anchor has no expiration time set
    always_active: bool
    # Whether the current requesting user has unlocked this anchor
    is_unlocked: bool = False
    # Distinct content types attached to this anchor (TEXT, FILE, LINK)
    content_type: Optional[List[str]] = None
    tags: Optional[List[str]] = None
<<<<<<< Updated upstream
    net_votes: int = 0
    user_vote: Optional[str] = None
=======
    is_savable: bool = True
>>>>>>> Stashed changes


class AnchorFilterOption(BaseModel):
    """Single filter option plus how many nearby anchors match it."""
    value: str
    count: int


class AnchorFilterOptionsResponse(BaseModel):
    """Available nearby filter options for discovery."""
    visibility: List[AnchorFilterOption]
    anchor_status: List[AnchorFilterOption]
    content_type: List[AnchorFilterOption]
    tags: List[AnchorFilterOption]
