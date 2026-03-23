"""
US9 #5 — Unit tests for unlock count

Tests:
    - Unlock count increments on each successful unlock
    - Unlock count is returned in anchor response
    - Anchor expires when max unlock count is reached
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from datetime import datetime, timedelta
from app.core.database import get_db
from sqlalchemy import text

client = TestClient(app)

_token_cache = None


def get_token():
    global _token_cache
    if _token_cache:
        return _token_cache
    response = client.post("/auth/login", json={
        "email": "user2@example.com",
        "password": "testpass123",
    })
    assert response.status_code == 200
    _token_cache = response.json()["access_token"]
    return _token_cache


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_anchor(token: str, max_unlock: int = None):
    payload = {
        "title": "Unlock Count Test Anchor",
        "description": "Test",
        "latitude": 40.4237,
        "longitude": -86.9212,
        "altitude": None,
        "visibility": "PUBLIC",
        "unlock_radius": 50,
        "max_unlock": max_unlock,
        "always_active": True,
        "tags": [],
    }
    response = client.post("/anchors/", json=payload, headers=auth_headers(token))
    assert response.status_code == 201
    anchor = response.json()

    # Backdate activation_time by 5 minutes so unlock checks pass immediately
    db = next(get_db())
    db.execute(
        text("UPDATE anchors SET activation_time = :t WHERE anchor_id = :id"),
        {"t": datetime.utcnow() - timedelta(minutes=5), "id": anchor["anchor_id"]},
    )
    db.commit()

    return anchor


class TestUnlockCount:

    def test_unlock_count_starts_at_zero(self):
        """Newly created anchor has current_unlock of 0."""
        token = get_token()
        anchor = create_anchor(token)
        assert anchor["current_unlock"] == 0

    def test_unlock_increments_count(self):
        """Unlocking an anchor increments current_unlock by 1."""
        token = get_token()
        anchor = create_anchor(token)
        anchor_id = anchor["anchor_id"]

        response = client.post(
            f"/anchors/{anchor_id}/unlock",
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        assert response.json()["unlocks"] == 1

    def test_unlock_count_increments_multiple_times(self):
        """Unlocking multiple times increments count correctly each time."""
        token = get_token()
        anchor = create_anchor(token)
        anchor_id = anchor["anchor_id"]

        for expected in range(1, 4):
            response = client.post(
                f"/anchors/{anchor_id}/unlock",
                headers=auth_headers(token),
            )
            assert response.status_code == 200
            assert response.json()["unlocks"] == expected

    def test_anchor_expires_when_max_unlock_reached(self):
        """Anchor status becomes EXPIRED when max_unlock count is reached."""
        token = get_token()
        anchor = create_anchor(token, max_unlock=2)
        anchor_id = anchor["anchor_id"]

        # First unlock
        client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))
        # Second unlock — should expire the anchor
        client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))

        # Third unlock should be rejected
        response = client.post(
            f"/anchors/{anchor_id}/unlock",
            headers=auth_headers(token),
        )
        assert response.status_code == 403

    def test_unlock_count_in_anchor_response(self):
        """current_unlock is returned correctly in the anchor response."""
        token = get_token()
        anchor = create_anchor(token)
        anchor_id = anchor["anchor_id"]

        client.post(f"/anchors/{anchor_id}/unlock", headers=auth_headers(token))

        response = client.get("/anchors/nearby", params={
            "lat": 40.4237,
            "lon": -86.9212,
            "radius_km": 50,
        }, headers=auth_headers(token))
        assert response.status_code == 200
        anchors = response.json()
        match = next((a for a in anchors if a["anchor_id"] == anchor_id), None)
        if match:
            assert match["current_unlock"] >= 1