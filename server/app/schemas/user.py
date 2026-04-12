from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Optional


class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_ghost_mode: Optional[bool] = None


class ProfileResponse(BaseModel):
    user_id: str
    email: str
    username: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_ghost_mode: bool


class BlockUserRequest(BaseModel):
    blocked_user_id: str


class BlockedUserResponse(BaseModel):
    user_id: str
    username: str
    avatar_url: Optional[str] = None
    blocked_at: datetime
