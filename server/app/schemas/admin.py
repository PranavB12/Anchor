from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AdminReportResponse(BaseModel):
    report_id: str
    reason: str
    description: Optional[str]
    status: str
    created_at: datetime

    anchor_id: str
    anchor_title: str
    anchor_status: str
    anchor_latitude: float
    anchor_longitude: float

    reporter_id: str
    reporter_username: str


class ResolveReportRequest(BaseModel):
    action: str          # DISMISS | ACTION
    delete_anchor: bool = False


class AdminUserSummaryResponse(BaseModel):
    user_id: str
    email: str
    username: str
    is_admin: bool = False
    is_banned: bool = False
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None


class BanUserRequest(BaseModel):
    is_banned: bool


class BanUserResponse(BaseModel):
    user_id: str
    is_banned: bool
    message: str


class AuditLogResponse(BaseModel):
    log_id: str
    user_id: str
    username: str
    email: str
    action_type: str
    target_id: Optional[str]
    target_type: Optional[str]
    metadata: Optional[dict]
    ip_address: Optional[str]
    timestamp: datetime

class AuditLogsPaginatedResponse(BaseModel):
    logs: list[AuditLogResponse]
    total_count: int
