"""
Endpoints:
    GET   /admin/reports              — list reports with anchor + reporter metadata (admin only)
    PATCH /admin/reports/{report_id}  — dismiss or action a report, optionally delete the anchor (admin only)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.admin import AdminReportResponse, ResolveReportRequest

router = APIRouter(prefix="/admin", tags=["Admin"])

VALID_ACTIONS = {"DISMISS", "ACTION"}


def _require_admin(user_id: str, db: Session):
    row = db.execute(
        text("SELECT is_admin FROM users WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()
    if not row or not row.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.get("/reports", response_model=list[AdminReportResponse])
def get_reports(
    report_status: str = Query(default="PENDING", alias="status"),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_admin(user_id, db)

    rows = db.execute(
        text("""
            SELECT
                r.report_id,
                r.reason,
                r.description,
                r.status,
                r.created_at,
                r.anchor_id,
                a.title  AS anchor_title,
                a.status AS anchor_status,
                ST_Y(a.location) AS anchor_latitude,
                ST_X(a.location) AS anchor_longitude,
                r.reporter_id,
                u.username AS reporter_username
            FROM reports r
            JOIN anchors a ON r.anchor_id = a.anchor_id
            JOIN users   u ON r.reporter_id = u.user_id
            WHERE r.status = :report_status
            ORDER BY r.created_at DESC
        """),
        {"report_status": report_status},
    ).fetchall()

    return [
        AdminReportResponse(
            report_id=row.report_id,
            reason=row.reason,
            description=row.description,
            status=row.status,
            created_at=row.created_at,
            anchor_id=row.anchor_id,
            anchor_title=row.anchor_title,
            anchor_status=row.anchor_status,
            anchor_latitude=row.anchor_latitude,
            anchor_longitude=row.anchor_longitude,
            reporter_id=row.reporter_id,
            reporter_username=row.reporter_username,
        )
        for row in rows
    ]


@router.patch("/reports/{report_id}")
def resolve_report(
    report_id: str,
    body: ResolveReportRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_admin(user_id, db)

    if body.action not in VALID_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action. Must be one of: {', '.join(sorted(VALID_ACTIONS))}",
        )

    report = db.execute(
        text("SELECT report_id, anchor_id, status FROM reports WHERE report_id = :report_id"),
        {"report_id": report_id},
    ).fetchone()

    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    if report.status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Report has already been resolved",
        )

    new_status = "DISMISSED" if body.action == "DISMISS" else "ACTIONED"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    db.execute(
        text("""
            UPDATE reports
            SET status = :new_status, reviewed_at = :reviewed_at
            WHERE report_id = :report_id
        """),
        {"new_status": new_status, "reviewed_at": now, "report_id": report_id},
    )

    if body.delete_anchor:
        db.execute(
            text("DELETE FROM anchors WHERE anchor_id = :anchor_id"),
            {"anchor_id": report.anchor_id},
        )

    db.commit()

    return {"message": f"Report {new_status.lower()}", "report_id": report_id, "anchor_deleted": body.delete_anchor}
