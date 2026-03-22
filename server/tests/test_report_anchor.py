"""
Tests for POST /anchors/{anchor_id}/report

Tests:
    - Submit a valid report returns 201
    - Report requires auth
    - Report on nonexistent anchor returns 404
    - Reporter cannot report their own anchor
    - Duplicate report from same user returns 409
    - Invalid reason returns 422
    - Anchor is auto-flagged after 3 pending reports
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

_tokens = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_token(email: str, username: str, password: str = "testpass123") -> str:
    if email in _tokens:
        return _tokens[email]
    resp = client.post("/auth/register", json={"email": email, "password": password, "username": username})
    if resp.status_code == 201:
        _tokens[email] = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={"email": email, "password": password})
        assert resp.status_code == 200
        _tokens[email] = resp.json()["access_token"]
    return _tokens[email]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_anchor(token: str, title: str = "Reportable Anchor") -> str:
    resp = client.post(
        "/anchors/",
        json={"title": title, "latitude": 40.4237, "longitude": -86.9212, "visibility": "PUBLIC"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    return resp.json()["anchor_id"]


def report_anchor(token: str, anchor_id: str, reason: str = "SPAM", description: str = None):
    body = {"reason": reason}
    if description:
        body["description"] = description
    return client.post(f"/anchors/{anchor_id}/report", json=body, headers=auth_headers(token))


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestReportAnchor:

    def test_report_success(self):
        """Valid report returns 201 with correct fields."""
        owner = get_token("report_owner1@example.com", "report_owner1")
        reporter = get_token("reporter1@example.com", "reporter1")
        anchor_id = create_anchor(owner, "Report Me")

        resp = report_anchor(reporter, anchor_id, reason="SPAM", description="Obvious spam content")
        assert resp.status_code == 201
        data = resp.json()
        assert data["anchor_id"] == anchor_id
        assert data["reason"] == "SPAM"
        assert data["description"] == "Obvious spam content"
        assert data["status"] == "PENDING"
        assert "report_id" in data

    def test_report_requires_auth(self):
        """POST without auth token returns 401 or 403."""
        owner = get_token("report_owner2@example.com", "report_owner2")
        anchor_id = create_anchor(owner)

        resp = client.post(f"/anchors/{anchor_id}/report", json={"reason": "SPAM"})
        assert resp.status_code in (401, 403)

    def test_report_nonexistent_anchor(self):
        """Reporting a nonexistent anchor returns 404."""
        reporter = get_token("reporter2@example.com", "reporter2")

        resp = report_anchor(reporter, "00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_report_own_anchor(self):
        """User cannot report their own anchor — returns 403."""
        owner = get_token("report_owner3@example.com", "report_owner3")
        anchor_id = create_anchor(owner, "My Own Anchor")

        resp = report_anchor(owner, anchor_id)
        assert resp.status_code == 403

    def test_duplicate_report(self):
        """Same user reporting the same anchor twice returns 409."""
        owner = get_token("report_owner4@example.com", "report_owner4")
        reporter = get_token("reporter3@example.com", "reporter3")
        anchor_id = create_anchor(owner, "Dupe Report Anchor")

        first = report_anchor(reporter, anchor_id)
        assert first.status_code == 201

        second = report_anchor(reporter, anchor_id)
        assert second.status_code == 409

    def test_invalid_reason(self):
        """Unknown reason string returns 422."""
        owner = get_token("report_owner5@example.com", "report_owner5")
        reporter = get_token("reporter4@example.com", "reporter4")
        anchor_id = create_anchor(owner, "Invalid Reason Anchor")

        resp = report_anchor(reporter, anchor_id, reason="OFFENSIVE")
        assert resp.status_code == 422

    def test_auto_flag_after_threshold(self):
        """Anchor status becomes FLAGGED once 3 unique users report it."""
        owner = get_token("flag_owner1@example.com", "flag_owner1")
        r1 = get_token("flag_reporter1@example.com", "flag_reporter1")
        r2 = get_token("flag_reporter2@example.com", "flag_reporter2")
        r3 = get_token("flag_reporter3@example.com", "flag_reporter3")

        anchor_id = create_anchor(owner, "Soon To Be Flagged")

        resp1 = report_anchor(r1, anchor_id)
        assert resp1.status_code == 201

        resp2 = report_anchor(r2, anchor_id)
        assert resp2.status_code == 201

        # Anchor should still be ACTIVE after 2 reports
        nearby = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50},
            headers=auth_headers(owner),
        )
        anchors = {a["anchor_id"]: a for a in nearby.json()}
        assert anchors[anchor_id]["status"] == "ACTIVE"

        resp3 = report_anchor(r3, anchor_id)
        assert resp3.status_code == 201

        # Anchor should now be FLAGGED
        nearby = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50},
            headers=auth_headers(owner),
        )
        anchors = {a["anchor_id"]: a for a in nearby.json()}
        assert anchors[anchor_id]["status"] == "FLAGGED"
