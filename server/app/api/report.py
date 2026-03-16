"""
Endpoints:
    POST /anchors/{anchor_id}/report — submit a report on an anchor
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.report import CreateReportRequest, ReportResponse

router = APIRouter(prefix="/anchors", tags=["Reports"])

VALID_REASONS = {"SPAM", "INAPPROPRIATE", "HARASSMENT", "MISINFORMATION", "OTHER"}
FLAG_THRESHOLD = 3


@router.post("/{anchor_id}/report", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
def report_anchor(
    anchor_id: str,
    body: CreateReportRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if body.reason not in VALID_REASONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid reason. Must be one of: {', '.join(sorted(VALID_REASONS))}",
        )

    # Verify anchor exists
    anchor = db.execute(
        text("SELECT anchor_id, creator_id, status FROM anchors WHERE anchor_id = :anchor_id"),
        {"anchor_id": anchor_id},
    ).fetchone()
    if not anchor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anchor not found")

    # Prevent reporting your own anchor
    if anchor.creator_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot report your own anchor",
        )

    # Enforce one report per user per anchor
    existing = db.execute(
        text("SELECT report_id FROM reports WHERE anchor_id = :anchor_id AND reporter_id = :reporter_id"),
        {"anchor_id": anchor_id, "reporter_id": user_id},
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reported this anchor",
        )

    report_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    db.execute(
        text("""
            INSERT INTO reports (report_id, anchor_id, reporter_id, reason, description, status, created_at)
            VALUES (:report_id, :anchor_id, :reporter_id, :reason, :description, 'PENDING', :created_at)
        """),
        {
            "report_id": report_id,
            "anchor_id": anchor_id,
            "reporter_id": user_id,
            "reason": body.reason,
            "description": body.description,
            "created_at": now,
        },
    )

    # Auto-flag anchor if PENDING report count hits threshold
    if anchor.status == "ACTIVE":
        report_count = db.execute(
            text("SELECT COUNT(*) AS cnt FROM reports WHERE anchor_id = :anchor_id AND status = 'PENDING'"),
            {"anchor_id": anchor_id},
        ).fetchone().cnt

        if report_count >= FLAG_THRESHOLD:
            db.execute(
                text("UPDATE anchors SET status = 'FLAGGED' WHERE anchor_id = :anchor_id"),
                {"anchor_id": anchor_id},
            )

    db.commit()

    return ReportResponse(
        report_id=report_id,
        anchor_id=anchor_id,
        reporter_id=user_id,
        reason=body.reason,
        description=body.description,
        status="PENDING",
        created_at=now,
    )
