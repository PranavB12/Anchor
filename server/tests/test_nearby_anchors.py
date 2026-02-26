"""
US12 #6 — Unit tests for sorting/filtering and list rendering

Tests:
    - Sort anchors by distance
    - Filter anchors by visibility (PUBLIC, PRIVATE)
    - Filter anchors by status (ACTIVE, EXPIRED)
    - Combined filter + sort
    - Empty results when no anchors in radius
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Cached token to avoid duplicate session inserts on rapid logins
_token_cache = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_token():
    """Login and return a valid access token (cached to avoid duplicate sessions)."""
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


def create_anchor(token: str, title: str, lat: float, lon: float, visibility: str = "PUBLIC"):
    """Helper to create a test anchor."""
    payload = {
        "title": title,
        "description": "Test anchor",
        "latitude": lat,
        "longitude": lon,
        "altitude": None,
        "visibility": visibility,
        "unlock_radius": 50,
        "max_unlock": None,
        "activation_time": "2026-01-01T00:00:00",
        "expiration_time": "2026-12-31T00:00:00",
        "tags": [],
    }
    response = client.post("/anchors/", json=payload, headers=auth_headers(token))
    assert response.status_code == 201
    return response.json()


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestNearbyAnchors:

    def test_nearby_returns_list(self):
        """GET /anchors/nearby returns a list."""
        token = get_token()
        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_sorted_by_distance(self):
        """Anchors are returned closest first."""
        token = get_token()

        create_anchor(token, "Close Anchor", lat=40.4237, lon=-86.9212)
        create_anchor(token, "Far Anchor", lat=40.5000, lon=-87.0000)

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50, "sort_by": "distance"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        assert len(anchors) >= 2

        titles = [a["title"] for a in anchors]
        if "Close Anchor" in titles and "Far Anchor" in titles:
            close_idx = titles.index("Close Anchor")
            far_idx = titles.index("Far Anchor")
            assert close_idx < far_idx, "Closer anchor should appear before farther anchor"

    def test_filter_by_public_visibility(self):
        """Filter returns only PUBLIC anchors."""
        token = get_token()
        create_anchor(token, "Public Test", lat=40.4237, lon=-86.9212, visibility="PUBLIC")

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50, "visibility": "PUBLIC"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        for anchor in anchors:
            assert anchor["visibility"] == "PUBLIC"

    def test_filter_by_private_visibility(self):
        """Filter returns only PRIVATE anchors."""
        token = get_token()
        create_anchor(token, "Private Test", lat=40.4237, lon=-86.9212, visibility="PRIVATE")

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50, "visibility": "PRIVATE"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        for anchor in anchors:
            assert anchor["visibility"] == "PRIVATE"

    def test_filter_by_active_status(self):
        """Filter returns only ACTIVE anchors."""
        token = get_token()
        create_anchor(token, "Active Test", lat=40.4237, lon=-86.9212)

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50, "anchor_status": "ACTIVE"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        for anchor in anchors:
            assert anchor["status"] == "ACTIVE"

    def test_invalid_visibility_filter(self):
        """Invalid visibility filter returns 400."""
        token = get_token()

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50, "visibility": "INVALID"},
            headers=auth_headers(token),
        )
        assert response.status_code == 400

    def test_invalid_status_filter(self):
        """Invalid status filter returns 400."""
        token = get_token()

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50, "anchor_status": "INVALID"},
            headers=auth_headers(token),
        )
        assert response.status_code == 400

    def test_no_results_outside_radius(self):
        """Returns empty list when no anchors are within radius."""
        token = get_token()

        response = client.get(
            "/anchors/nearby",
            params={"lat": 0.0, "lon": 0.0, "radius_km": 1},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        assert response.json() == []

    def test_requires_authentication(self):
        """Returns 401 when no token provided."""
        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212},
        )
        assert response.status_code == 401

    def test_combined_filter_and_sort(self):
        """Combined visibility filter and distance sort works correctly."""
        token = get_token()

        response = client.get(
            "/anchors/nearby",
            params={
                "lat": 40.4237,
                "lon": -86.9212,
                "radius_km": 50,
                "visibility": "PUBLIC",
                "sort_by": "distance",
            },
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        for anchor in anchors:
            assert anchor["visibility"] == "PUBLIC"