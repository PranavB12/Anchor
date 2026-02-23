from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CreateAnchorRequest(BaseModel):
    title: str = Field(max_length=255)
    description: Optional[str] = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: Optional[float] = None
    visibility: str = Field(description="PUBLIC, PRIVATE, or CIRCLE_ONLY")
    unlock_radius: int = Field(default=50, ge=10, le=100)
    max_unlock: Optional[int] = None
    activation_time: Optional[datetime] = None
    expiration_time: Optional[datetime] = None
    tags: Optional[List[str]] = None


class UpdateAnchorRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    altitude: Optional[float] = None
    visibility: Optional[str] = None
    unlock_radius: Optional[int] = Field(default=None, ge=10, le=100)
    max_unlock: Optional[int] = None
    activation_time: Optional[datetime] = None
    expiration_time: Optional[datetime] = None
    tags: Optional[List[str]] = None


class AnchorResponse(BaseModel):
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
    tags: Optional[List[str]] = None
