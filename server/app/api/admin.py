"""
Endpoints:
    GET   /admin/reports              — list reports with anchor + reporter metadata (admin only)
    PATCH /admin/reports/{report_id}  — dismiss or action a report, optionally delete the anchor (admin only)
"""

from datetime import datetime, timezone
from typing import Optional
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.audit import log_action

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.admin import (
    AdminReportResponse, 
    ResolveReportRequest, 
    AdminUserSummaryResponse,
    BanUserRequest,
    BanUserResponse,
    AuditLogResponse, 
    AuditLogsPaginatedResponse
)

router = APIRouter(prefix="/admin", tags=["Admin"])

VALID_ACTIONS = {"DISMISS", "ACTION"}


def _require_admin(user_id: str, db: Session):
    row = db.execute(
        text("SELECT is_admin FROM users WHERE user_id = :user_id"),
        {"user_id": user_id},
    ).fetchone()
    if not row or not row.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


def _row_to_admin_user_summary(row) -> AdminUserSummaryResponse:
    return AdminUserSummaryResponse(
        user_id=row.user_id,
        email=row.email,
        username=row.username,
        is_admin=bool(getattr(row, "is_admin", False)),
        is_banned=bool(getattr(row, "is_banned", False)),
        created_at=getattr(row, "created_at", None),
        last_login=getattr(row, "last_login", None),
    )


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


@router.get("/users", response_model=list[AdminUserSummaryResponse])
@router.get("/users/search", response_model=list[AdminUserSummaryResponse])
def search_users(
    query: str = Query(..., min_length=1),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_admin(user_id, db)

    normalized_query = f"%{query.strip().lower()}%"
    rows = db.execute(
        text("""
            SELECT
                user_id,
                email,
                username,
                is_admin,
                is_banned,
                created_at,
                last_login
            FROM users
            WHERE LOWER(email) LIKE :query
               OR LOWER(username) LIKE :query
            ORDER BY
                is_admin DESC,
                is_banned DESC,
                last_login DESC,
                created_at DESC
            LIMIT 50
        """),
        {"query": normalized_query},
    ).fetchall()

    return [_row_to_admin_user_summary(row) for row in rows]


@router.post("/users/{target_user_id}/ban", response_model=BanUserResponse)
def set_user_ban_status(
    target_user_id: str,
    body: BanUserRequest,
    request: Request,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_admin(user_id, db)

    if target_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot ban their own account",
        )

    existing = db.execute(
        text("SELECT user_id, username FROM users WHERE user_id = :target_user_id"),
        {"target_user_id": target_user_id},
    ).fetchone()
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    db.execute(
        text("""
            UPDATE users
            SET is_banned = :is_banned
            WHERE user_id = :target_user_id
        """),
        {
            "is_banned": body.is_banned,
            "target_user_id": target_user_id,
        },
    )

    if body.is_banned:
        db.execute(
            text("""
                UPDATE user_sessions
                SET revoked_at = :now
                WHERE user_id = :target_user_id
                  AND revoked_at IS NULL
            """),
            {
                "now": datetime.utcnow(),
                "target_user_id": target_user_id,
            },
        )

    db.commit()

    log_action(
        db,
        user_id,
        "USER_BAN" if body.is_banned else "USER_UNBAN",
        target_id=target_user_id,
        target_type="USER",
        metadata={"is_banned": body.is_banned},
        request=request,
    )

    status_label = "banned" if body.is_banned else "unbanned"
    return BanUserResponse(
        user_id=target_user_id,
        is_banned=body.is_banned,
        message=f"User {existing.username} {status_label} successfully",
    )

@router.get("/audit-logs", response_model=AuditLogsPaginatedResponse)
def get_audit_logs(
    action_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = 100,
    offset: int = 0,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    _require_admin(user_id, db)

    where_clauses = ["1=1"]
    params = {}

    if action_type:
        where_clauses.append("al.action_type = :action_type")
        params["action_type"] = action_type

    if start_date:
        where_clauses.append("al.timestamp >= :start_date")
        params["start_date"] = start_date

    if end_date:
        where_clauses.append("al.timestamp <= :end_date")
        params["end_date"] = end_date

    where_str = " AND ".join(where_clauses)
    
    count_query = f"SELECT COUNT(*) as total_count FROM audit_logs al WHERE {where_str}"
    total_count = db.execute(text(count_query), params).scalar()

    query = f"""
        SELECT 
            al.log_id, al.user_id, u.username, u.email,
            al.action_type, al.target_id, al.target_type,
            al.metadata, al.ip_address, al.timestamp
        FROM audit_logs al
        JOIN users u ON al.user_id = u.user_id
        WHERE {where_str}
        ORDER BY al.timestamp DESC
        LIMIT :limit OFFSET :offset
    """
    data_params = params.copy()
    data_params["limit"] = limit
    data_params["offset"] = offset

    rows = db.execute(text(query), data_params).fetchall()

    def parse_metadata(m):
        if not m: return None
        if isinstance(m, dict): return m
        try:
            return json.loads(m)
        except Exception:
            return None

    logs = [
        AuditLogResponse(
            log_id=row.log_id,
            user_id=row.user_id,
            username=row.username,
            email=row.email,
            action_type=row.action_type,
            target_id=row.target_id,
            target_type=row.target_type,
            metadata=parse_metadata(row.metadata),
            ip_address=row.ip_address,
            timestamp=row.timestamp,
        )
        for row in rows
    ]

    return AuditLogsPaginatedResponse(logs=logs, total_count=total_count)
