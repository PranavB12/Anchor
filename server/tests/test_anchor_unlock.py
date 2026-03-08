"""
US8 #2/#3 — Automated tests for unlock endpoint expiration and max unlock enforcement
US11 #3  — Activation window enforcement on unlock

Tests:
    - Successful unlock increments current_unlock
    - Unlock requires authentication
    - Unlock on nonexistent anchor returns 404
    - Unlock blocked before activation_time window opens
    - Unlock blocked after expiration_time and auto-marks anchor EXPIRED
    - Unlock blocked when max_unlock already reached
    - Anchor auto-expires after final allowed unlock
    - Unlock blocked on already-expired anchor
"""

import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

_token_cache = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_token():
    """Register/login a test user and return cached access token."""
    global _token_cache
    if _token_cache:
        return _token_cache
    resp = client.post("/auth/register", json={
        "email": "testunlock@example.com",
        "password": "testpass123",
        "username": "testunlock",
    })
    if resp.status_code == 201:
        _token_cache = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "testunlock@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _token_cache = resp.json()["access_token"]
    return _token_cache


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_anchor(token: str, **overrides) -> dict:
    """Create a basic always-active anchor, with optional field overrides."""
    payload = {
        "title": "Unlock Test Anchor",
        "latitude": 40.4237,
        "longitude": -86.9212,
        "visibility": "PUBLIC",
        "unlock_radius": 50,
        "always_active": True,
    }
    payload.update(overrides)
    resp = client.post("/anchors/", json=payload, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestUnlockAnchor:

    def test_unlock_success(self):
        """POST /anchors/{id}/unlock increments current_unlock and returns 200."""
        token = get_token()
        anchor = create_anchor(token)
        anchor_id = anchor["anchor_id"]

        resp = client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["unlocks"] == 1
        assert data["anchor_id"] == anchor_id

    def test_unlock_requires_auth(self):
        """POST /anchors/{id}/unlock without token returns 401."""
        token = get_token()
        anchor = create_anchor(token)

        resp = client.post(f"/anchors/{anchor['anchor_id']}/unlock")
        assert resp.status_code in (401, 403)

    def test_unlock_nonexistent_anchor(self):
        """POST /anchors/{id}/unlock on bad ID returns 404."""
        token = get_token()
        resp = client.post(
            "/anchors/00000000-0000-0000-0000-000000000000/unlock",
            headers=auth_headers(token),
        )
        assert resp.status_code == 404

    def test_unlock_blocked_before_activation_time(self):
        """US11 #3 — Unlock is blocked when current time is before activation_time."""
        token = get_token()
        future_start = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        future_end = (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat()
        anchor = create_anchor(
            token,
            title="Not Yet Active",
            activation_time=future_start,
            expiration_time=future_end,
            always_active=False,
        )

        resp = client.post(f"/anchors/{anchor['anchor_id']}/unlock", headers=auth_headers(token))
        assert resp.status_code == 403
        assert "not yet active" in resp.json()["detail"].lower()

    def test_unlock_blocked_after_expiration_time(self):
        """US8 #2 — Unlock is blocked when past expiration_time and anchor is auto-marked EXPIRED."""
        token = get_token()
        anchor = create_anchor(token, title="Already Expired")
        anchor_id = anchor["anchor_id"]

        # Patch expiration to the past to simulate an expired anchor
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        patch_resp = client.patch(
            f"/anchors/{anchor_id}",
            json={"expiration_time": past, "always_active": False},
            headers=auth_headers(token),
        )
        assert patch_resp.status_code == 200

        resp = client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        assert resp.status_code == 403
        assert "expired" in resp.json()["detail"].lower()

    def test_unlock_blocked_when_max_unlock_reached(self):
        """US8 #3 — Unlock is blocked when current_unlock has already hit max_unlock."""
        token = get_token()
        anchor = create_anchor(token, title="Max Unlock One", max_unlock=1)
        anchor_id = anchor["anchor_id"]

        # First unlock should succeed
        first = client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        assert first.status_code == 200

        # Second unlock should be blocked — anchor is now EXPIRED
        second = client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        assert second.status_code == 403

    def test_anchor_auto_expires_after_final_unlock(self):
        """US8 #3 — Anchor status becomes EXPIRED after reaching max_unlock count."""
        token = get_token()
        anchor = create_anchor(token, title="Auto Expire", max_unlock=2)
        anchor_id = anchor["anchor_id"]

        # Unlock twice to hit the limit
        client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))

        # Third unlock should fail since anchor is now EXPIRED
        resp = client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        assert resp.status_code == 403

    def test_unlock_blocked_on_already_expired_anchor(self):
        """Anchor with status EXPIRED cannot be unlocked."""
        token = get_token()
        anchor = create_anchor(token, title="Force Expire", max_unlock=1)
        anchor_id = anchor["anchor_id"]

        # Expire it via the one allowed unlock
        client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))

        # Any further unlock attempt is blocked
        resp = client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        assert resp.status_code == 403
        assert resp.json()["detail"] is not None
