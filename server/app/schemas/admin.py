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
