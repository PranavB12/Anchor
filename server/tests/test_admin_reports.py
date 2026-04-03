"""
Integration tests for admin report moderation endpoints.

Coverage:
- GET /admin/reports returns only unresolved (PENDING) reports by default.
- PATCH /admin/reports/{report_id} with delete_anchor removes the anchor.
- PATCH /admin/reports/{report_id} with dismiss leaves the anchor and resolves the report.
"""

import os
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import text

# Ensure settings parse in test environments even if local .env has non-boolean DEBUG.
os.environ["DEBUG"] = "false"

from app.core.database import SessionLocal
from app.main import app

client = TestClient(app)


def register_user(prefix: str):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"{prefix}-{suffix}@example.com",
        "password": "testpass123",
        "username": f"{prefix}_{suffix}",
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    return {**payload, **response.json()}


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def set_admin(user_id: str):
    db = SessionLocal()
    try:
        db.execute(
            text("""
                UPDATE users
                SET is_admin = TRUE
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        db.commit()
    finally:
        db.close()


def create_anchor(token: str, title: str) -> str:
    response = client.post(
        "/anchors/",
        json={
            "title": title,
            "description": "Admin moderation test anchor",
            "latitude": 40.4237,
            "longitude": -86.9212,
            "visibility": "PUBLIC",
            "unlock_radius": 75,
            "always_active": True,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()["anchor_id"]


def report_anchor(token: str, anchor_id: str, description: str) -> str:
    response = client.post(
        f"/anchors/{anchor_id}/report",
        json={"reason": "SPAM", "description": description},
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()["report_id"]


def fetch_report_row(report_id: str):
    db = SessionLocal()
    try:
        return db.execute(
            text("""
                SELECT report_id, anchor_id, status, reviewed_at
                FROM reports
                WHERE report_id = :report_id
            """),
            {"report_id": report_id},
        ).fetchone()
    finally:
        db.close()


def fetch_anchor_row(anchor_id: str):
    db = SessionLocal()
    try:
        return db.execute(
            text("""
                SELECT anchor_id, status
                FROM anchors
                WHERE anchor_id = :anchor_id
            """),
            {"anchor_id": anchor_id},
        ).fetchone()
    finally:
        db.close()


def test_admin_reports_endpoint_returns_only_pending_reports():
    admin = register_user("reportsadmin")
    owner = register_user("reportsowner")
    reporter_one = register_user("reportsr1")
    reporter_two = register_user("reportsr2")
    reporter_three = register_user("reportsr3")
    set_admin(admin["user_id"])

    pending_anchor_id = create_anchor(owner["access_token"], "Pending Report Anchor")
    dismissed_anchor_id = create_anchor(owner["access_token"], "Dismissed Report Anchor")

    pending_report_id = report_anchor(
        reporter_one["access_token"],
        pending_anchor_id,
        "Pending moderation comment",
    )
    dismissed_report_id = report_anchor(
        reporter_two["access_token"],
        dismissed_anchor_id,
        "False alarm comment",
    )

    dismiss_response = client.patch(
        f"/admin/reports/{dismissed_report_id}",
        json={"action": "DISMISS", "delete_anchor": False},
        headers=auth_headers(admin["access_token"]),
    )
    assert dismiss_response.status_code == 200

    second_pending_anchor_id = create_anchor(owner["access_token"], "Newest Pending Report")
    newest_pending_report_id = report_anchor(
        reporter_three["access_token"],
        second_pending_anchor_id,
        "Most recent pending comment",
    )

    response = client.get(
        "/admin/reports",
        headers=auth_headers(admin["access_token"]),
    )

    assert response.status_code == 200
    reports = response.json()
    returned_ids = [report["report_id"] for report in reports]

    assert newest_pending_report_id in returned_ids
    assert pending_report_id in returned_ids
    assert dismissed_report_id not in returned_ids
    assert reports[0]["report_id"] == newest_pending_report_id
    assert all(report["status"] == "PENDING" for report in reports)


def test_delete_anchor_resolution_removes_anchor_from_database():
    admin = register_user("deleteadmin")
    owner = register_user("deleteowner")
    reporter = register_user("deletereporter")
    set_admin(admin["user_id"])

    anchor_id = create_anchor(owner["access_token"], "Delete Me Anchor")
    report_id = report_anchor(reporter["access_token"], anchor_id, "Delete this anchor")

    response = client.patch(
        f"/admin/reports/{report_id}",
        json={"action": "ACTION", "delete_anchor": True},
        headers=auth_headers(admin["access_token"]),
    )

    assert response.status_code == 200
    assert response.json()["anchor_deleted"] is True
    assert fetch_anchor_row(anchor_id) is None


def test_dismiss_resolution_marks_report_resolved_without_deleting_anchor():
    admin = register_user("dismissadmin")
    owner = register_user("dismissowner")
    reporter = register_user("dismissreporter")
    set_admin(admin["user_id"])

    anchor_id = create_anchor(owner["access_token"], "Keep Me Anchor")
    report_id = report_anchor(reporter["access_token"], anchor_id, "This report should be dismissed")

    response = client.patch(
        f"/admin/reports/{report_id}",
        json={"action": "DISMISS", "delete_anchor": False},
        headers=auth_headers(admin["access_token"]),
    )

    assert response.status_code == 200
    assert response.json()["anchor_deleted"] is False

    report_row = fetch_report_row(report_id)
    anchor_row = fetch_anchor_row(anchor_id)

    assert report_row is not None
    assert report_row.status == "DISMISSED"
    assert report_row.reviewed_at is not None
    assert anchor_row is not None
    assert anchor_row.anchor_id == anchor_id
