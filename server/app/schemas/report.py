from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CreateReportRequest(BaseModel):
    reason: str  # SPAM | INAPPROPRIATE | HARASSMENT | MISINFORMATION | OTHER
    description: Optional[str] = None


class ReportResponse(BaseModel):
    report_id: str
    anchor_id: str
    reporter_id: str
    reason: str
    description: Optional[str]
    status: str
    created_at: datetime
