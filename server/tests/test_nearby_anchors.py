"""
US12 #6 — Unit tests for sorting/filtering and list rendering

Tests:
    - Sort anchors by distance
    - Filter anchors by visibility (PUBLIC, PRIVATE)
    - Filter anchors by status (ACTIVE, EXPIRED)
    - Combined filter + sort
    - Empty results when no anchors in radius
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import app
from app.core.database import SessionLocal

client = TestClient(app)

# Cached token to avoid duplicate session inserts on rapid logins
_token_cache = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_token():
    """Login and return a valid access token (cached to avoid duplicate sessions)."""
    global _token_cache
    if _token_cache:
        return _token_cache

    # Register if needed, otherwise log in.
    register_response = client.post("/auth/register", json={
        "email": "user2@example.com",
        "password": "testpass123",
        "username": "user2_test",
    })
    if register_response.status_code == 201:
        _token_cache = register_response.json()["access_token"]
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


def create_anchor(
    token: str,
    title: str,
    lat: float,
    lon: float,
    visibility: str = "PUBLIC",
    tags: list[str] | None = None,
):
    """Helper to create a test anchor. Uses always_active=True to avoid time-based failures."""
    payload = {
        "title": title,
        "description": "Test anchor",
        "latitude": lat,
        "longitude": lon,
        "altitude": None,
        "visibility": visibility,
        "unlock_radius": 50,
        "max_unlock": None,
        "always_active": True,
        "tags": tags or [],
    }
    response = client.post("/anchors/", json=payload, headers=auth_headers(token))
    assert response.status_code == 201
    return response.json()


def attach_content(anchor_id: str, content_type: str):
    """Insert content metadata row for content_type filter tests."""
    content_id = str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.execute(
            text("""
                INSERT INTO Content (content_id, anchor_id, content_type, size_bytes)
                VALUES (:content_id, :anchor_id, :content_type, :size_bytes)
            """),
            {
                "content_id": content_id,
                "anchor_id": anchor_id,
                "content_type": content_type,
                "size_bytes": 128,
            },
        )
        db.commit()
    finally:
        db.close()


def update_anchor_status(anchor_id: str, status: str):
    db = SessionLocal()
    try:
        db.execute(
            text("UPDATE anchors SET status = :status WHERE anchor_id = :anchor_id"),
            {"status": status, "anchor_id": anchor_id},
        )
        db.commit()
    finally:
        db.close()


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

    def test_filter_by_content_type(self):
        """Filter returns only anchors that have the requested content type."""
        token = get_token()
        text_anchor = create_anchor(token, "Text Content Anchor", lat=40.4237, lon=-86.9212)
        file_anchor = create_anchor(token, "File Content Anchor", lat=40.4238, lon=-86.9213)
        attach_content(text_anchor["anchor_id"], "TEXT")
        attach_content(file_anchor["anchor_id"], "FILE")

        response = client.get(
            "/anchors/nearby",
            params=[
                ("lat", 40.4237),
                ("lon", -86.9212),
                ("radius_km", 50),
                ("content_type", "TEXT"),
            ],
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        assert len(anchors) > 0
        assert all(
            "TEXT" in (anchor.get("content_type") or [])
            for anchor in anchors
        )
        assert all(anchor["anchor_id"] != file_anchor["anchor_id"] for anchor in anchors)

    def test_invalid_content_type_filter(self):
        """Invalid content_type filter returns 400."""
        token = get_token()
        response = client.get(
            "/anchors/nearby",
            params={
                "lat": 40.4237,
                "lon": -86.9212,
                "radius_km": 50,
                "content_type": "VIDEO",
            },
            headers=auth_headers(token),
        )
        assert response.status_code == 400

    def test_filter_by_tags(self):
        """Filter returns anchors matching any selected tag."""
        token = get_token()
        music_anchor = create_anchor(
            token,
            "Music Tag Anchor",
            lat=40.4237,
            lon=-86.9212,
            tags=["music", "chill"],
        )
        study_anchor = create_anchor(
            token,
            "Study Tag Anchor",
            lat=40.4238,
            lon=-86.9213,
            tags=["study"],
        )

        response = client.get(
            "/anchors/nearby",
            params=[
                ("lat", 40.4237),
                ("lon", -86.9212),
                ("radius_km", 50),
                ("tags", "music"),
            ],
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        assert any(anchor["anchor_id"] == music_anchor["anchor_id"] for anchor in anchors)
        assert all(anchor["anchor_id"] != study_anchor["anchor_id"] for anchor in anchors)
        assert all("music" in [tag.lower() for tag in (anchor.get("tags") or [])] for anchor in anchors)

    def test_filter_by_multiple_visibility_values(self):
        """Repeated visibility filters return anchors from either visibility bucket."""
        token = get_token()
        public_anchor = create_anchor(token, "Multi Public", lat=40.4237, lon=-86.9212, visibility="PUBLIC")
        private_anchor = create_anchor(token, "Multi Private", lat=40.4238, lon=-86.9213, visibility="PRIVATE")

        response = client.get(
            "/anchors/nearby",
            params=[
                ("lat", 40.4237),
                ("lon", -86.9212),
                ("radius_km", 50),
                ("visibility", "PUBLIC"),
                ("visibility", "PRIVATE"),
            ],
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        anchor_ids = {anchor["anchor_id"] for anchor in anchors}
        assert public_anchor["anchor_id"] in anchor_ids
        assert private_anchor["anchor_id"] in anchor_ids
        assert all(anchor["visibility"] in {"PUBLIC", "PRIVATE"} for anchor in anchors)

    def test_filter_by_locked_status(self):
        """Status filter can return non-active anchors that are still in the current time window."""
        token = get_token()
        locked_anchor = create_anchor(token, "Locked Status Anchor", lat=40.4237, lon=-86.9212)
        update_anchor_status(locked_anchor["anchor_id"], "LOCKED")

        response = client.get(
            "/anchors/nearby",
            params={
                "lat": 40.4237,
                "lon": -86.9212,
                "radius_km": 50,
                "anchor_status": "LOCKED",
            },
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        assert any(anchor["anchor_id"] == locked_anchor["anchor_id"] for anchor in anchors)
        assert all(anchor["status"] == "LOCKED" for anchor in anchors)

    def test_filter_by_multiple_content_types(self):
        """Repeated content_type filters match anchors with any requested content type."""
        token = get_token()
        text_anchor = create_anchor(token, "Multi Text Anchor", lat=40.4237, lon=-86.9212)
        file_anchor = create_anchor(token, "Multi File Anchor", lat=40.4238, lon=-86.9213)
        attach_content(text_anchor["anchor_id"], "TEXT")
        attach_content(file_anchor["anchor_id"], "FILE")

        response = client.get(
            "/anchors/nearby",
            params=[
                ("lat", 40.4237),
                ("lon", -86.9212),
                ("radius_km", 50),
                ("content_type", "TEXT"),
                ("content_type", "FILE"),
            ],
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        anchor_ids = {anchor["anchor_id"] for anchor in anchors}
        assert text_anchor["anchor_id"] in anchor_ids
        assert file_anchor["anchor_id"] in anchor_ids
        assert all(
            any(content_type in {"TEXT", "FILE"} for content_type in (anchor.get("content_type") or []))
            for anchor in anchors
        )

    def test_nearby_filter_options_returns_available_counts(self):
        """Filter options endpoint returns nearby tag and enum counts."""
        token = get_token()
        options_anchor = create_anchor(
            token,
            "Options Route Anchor",
            lat=40.4237,
            lon=-86.9212,
            visibility="PRIVATE",
            tags=["rare-filter-tag"],
        )
        attach_content(options_anchor["anchor_id"], "LINK")

        response = client.get(
            "/anchors/nearby/filter-options",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        payload = response.json()

        tag_counts = {item["value"]: item["count"] for item in payload["tags"]}
        visibility_counts = {item["value"]: item["count"] for item in payload["visibility"]}
        content_counts = {item["value"]: item["count"] for item in payload["content_type"]}

        assert tag_counts["rare-filter-tag"] >= 1
        assert visibility_counts["PRIVATE"] >= 1
        assert content_counts["LINK"] >= 1

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

class TestLocationBasedDiscovery:

    def test_anchors_returned_for_real_coordinates(self):
        """Anchors near valid user coordinates are returned correctly."""
        token = get_token()
        create_anchor(token, "Location Test Anchor", lat=40.4237, lon=-86.9212)

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50, "sort_by": "distance"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        assert any(a["title"] == "Location Test Anchor" for a in anchors)

    def test_fallback_coordinates_return_west_lafayette_anchors(self):
        """Anchors near the fallback center (West Lafayette) are returned correctly."""
        token = get_token()
        create_anchor(token, "Fallback Center Anchor", lat=40.4237, lon=-86.9081)

        response = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9081, "radius_km": 50, "sort_by": "distance"},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        anchors = response.json()
        assert any(a["title"] == "Fallback Center Anchor" for a in anchors)

    def test_no_anchors_returned_for_denied_location(self):
        """When location is denied and fallback is far from any anchors, empty list is returned."""
        token = get_token()

        response = client.get(
            "/anchors/nearby",
            params={"lat": 0.0, "lon": 0.0, "radius_km": 1},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        assert response.json() == []
