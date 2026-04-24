"""
Pydantic schemas for the Personal Library (saved anchors).

SaveAnchorRequest  — body for POST /user/library/save
SavedAnchorResponse — shape returned by GET /user/library (full anchor + saved_at)
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class SavedAnchorExpirationStatus:
    LIVE = "LIVE"
    EXPIRED = "EXPIRED"


class SaveAnchorRequest(BaseModel):
    anchor_id: str


class SavedAnchorResponse(BaseModel):
    """Saved anchor — mirrors AnchorResponse and adds the save timestamp."""
    anchor_id: str
    creator_id: str
    title: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    altitude: Optional[float] = None
    status: str
    visibility: str
    unlock_radius: int
    max_unlock: Optional[int] = None
    current_unlock: int
    activation_time: Optional[datetime] = None
    expiration_time: Optional[datetime] = None
    always_active: bool
    expiration_status: str
    content_type: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    saved_at: datetime
