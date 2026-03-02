"""
US9 #4 — Automated tests for Anchor create, edit, and delete endpoints
US6 #4 — Automated tests for radius validation
US7 #3 — Test that private anchor cannot be fetched by another user
US5 #7 — Test that users can see anchors created by others

Tests:
    - Create anchor with valid data
    - Create anchor fails without auth
    - Create anchor fails with invalid visibility
    - Edit anchor (title, description, radius)
    - Edit anchor fails for non-owner
    - Edit anchor fails for nonexistent anchor
    - Delete anchor
    - Delete anchor fails for non-owner
    - Delete returns 404 after deletion
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

_user1_token = None
_user2_token = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_user1_token():
    """Register/login user1 and return token."""
    global _user1_token
    if _user1_token:
        return _user1_token
    # Try register first, fall back to login if already exists
    resp = client.post("/auth/register", json={
        "email": "testcrud1@example.com",
        "password": "testpass123",
        "username": "testcrud1",
    })
    if resp.status_code == 201:
        _user1_token = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "testcrud1@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _user1_token = resp.json()["access_token"]
    return _user1_token


def get_user2_token():
    """Register/login user2 for ownership tests."""
    global _user2_token
    if _user2_token:
        return _user2_token
    resp = client.post("/auth/register", json={
        "email": "testcrud2@example.com",
        "password": "testpass123",
        "username": "testcrud2",
    })
    if resp.status_code == 201:
        _user2_token = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "testcrud2@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _user2_token = resp.json()["access_token"]
    return _user2_token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def make_anchor_payload(**overrides):
    base = {
        "title": "Test Anchor",
        "latitude": 40.4237,
        "longitude": -86.9212,
        "visibility": "PUBLIC",
        "unlock_radius": 50,
    }
    base.update(overrides)
    return base


# ── Create Tests ─────────────────────────────────────────────────────────────

class TestCreateAnchor:

    def test_create_success(self):
        """POST /anchors/ with valid data returns 201."""
        token = get_user1_token()
        resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Create Test"),
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Create Test"
        assert data["latitude"] == 40.4237
        assert data["longitude"] == -86.9212
        assert data["visibility"] == "PUBLIC"
        assert data["status"] == "ACTIVE"
        assert "anchor_id" in data

    def test_create_with_optional_fields(self):
        """Anchor creation works with description, tags, max_unlock."""
        token = get_user1_token()
        resp = client.post(
            "/anchors/",
            json=make_anchor_payload(
                title="Full Anchor",
                description="A test anchor",
                tags=["test", "demo"],
                max_unlock=5,
            ),
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["description"] == "A test anchor"
        assert data["tags"] == ["test", "demo"]
        assert data["max_unlock"] == 5

    def test_create_requires_auth(self):
        """POST /anchors/ without token returns 401."""
        resp = client.post("/anchors/", json=make_anchor_payload())
        assert resp.status_code in (401, 403)

    def test_create_invalid_visibility(self):
        """Invalid visibility returns 400."""
        token = get_user1_token()
        resp = client.post(
            "/anchors/",
            json=make_anchor_payload(visibility="INVALID"),
            headers=auth_headers(token),
        )
        assert resp.status_code == 400


# ── Edit Tests ───────────────────────────────────────────────────────────────

class TestEditAnchor:

    def test_edit_title(self):
        """PATCH /anchors/{id} updates title only."""
        token = get_user1_token()
        # Create
        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Before Edit"),
            headers=auth_headers(token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        # Edit
        edit_resp = client.patch(
            f"/anchors/{anchor_id}",
            json={"title": "After Edit"},
            headers=auth_headers(token),
        )
        assert edit_resp.status_code == 200
        assert edit_resp.json()["title"] == "After Edit"
        # Other fields unchanged
        assert edit_resp.json()["visibility"] == "PUBLIC"
        assert edit_resp.json()["latitude"] == 40.4237

    def test_edit_description_and_radius(self):
        """PATCH updates multiple fields at once."""
        token = get_user1_token()
        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Multi Edit"),
            headers=auth_headers(token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        edit_resp = client.patch(
            f"/anchors/{anchor_id}",
            json={"description": "New desc", "unlock_radius": 75},
            headers=auth_headers(token),
        )
        assert edit_resp.status_code == 200
        assert edit_resp.json()["description"] == "New desc"
        assert edit_resp.json()["unlock_radius"] == 75

    def test_edit_nonexistent_anchor(self):
        """PATCH on nonexistent anchor returns 404."""
        token = get_user1_token()
        resp = client.patch(
            "/anchors/00000000-0000-0000-0000-000000000000",
            json={"title": "Ghost"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 404

    def test_edit_not_owner(self):
        """PATCH by non-owner returns 403."""
        owner_token = get_user1_token()
        other_token = get_user2_token()

        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Owner Only Edit"),
            headers=auth_headers(owner_token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        edit_resp = client.patch(
            f"/anchors/{anchor_id}",
            json={"title": "Hijacked"},
            headers=auth_headers(other_token),
        )
        assert edit_resp.status_code == 403


# ── Delete Tests ─────────────────────────────────────────────────────────────

class TestDeleteAnchor:

    def test_delete_success(self):
        """DELETE /anchors/{id} by owner returns 200."""
        token = get_user1_token()
        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="To Delete"),
            headers=auth_headers(token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        del_resp = client.delete(
            f"/anchors/{anchor_id}",
            headers=auth_headers(token),
        )
        assert del_resp.status_code == 200

    def test_delete_then_404(self):
        """Deleted anchor returns 404 on subsequent access."""
        token = get_user1_token()
        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Delete Then Check"),
            headers=auth_headers(token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        client.delete(f"/anchors/{anchor_id}", headers=auth_headers(token))

        # Edit should now 404
        edit_resp = client.patch(
            f"/anchors/{anchor_id}",
            json={"title": "Ghost"},
            headers=auth_headers(token),
        )
        assert edit_resp.status_code == 404

    def test_delete_not_owner(self):
        """DELETE by non-owner returns 403."""
        owner_token = get_user1_token()
        other_token = get_user2_token()

        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Owner Only Delete"),
            headers=auth_headers(owner_token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        del_resp = client.delete(
            f"/anchors/{anchor_id}",
            headers=auth_headers(other_token),
        )
        assert del_resp.status_code == 403

    def test_delete_nonexistent(self):
        """DELETE on nonexistent anchor returns 404."""
        token = get_user1_token()
        resp = client.delete(
            "/anchors/00000000-0000-0000-0000-000000000000",
            headers=auth_headers(token),
        )
        assert resp.status_code == 404


# ── Radius Validation Tests (US6 #4) ─────────────────────────────────────────

class TestRadiusValidation:

    def test_radius_default_value(self):
        """Anchor created without radius gets default of 50."""
        token = get_user1_token()
        payload = {
            "title": "Default Radius",
            "latitude": 40.4237,
            "longitude": -86.9212,
            "visibility": "PUBLIC",
        }
        resp = client.post("/anchors/", json=payload, headers=auth_headers(token))
        assert resp.status_code == 201
        assert resp.json()["unlock_radius"] == 50

    def test_radius_within_range(self):
        """Radius of 75 (within 10-100) is accepted."""
        token = get_user1_token()
        resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Valid Radius", unlock_radius=75),
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        assert resp.json()["unlock_radius"] == 75

    def test_radius_too_small(self):
        """Radius below 10 is rejected (422 validation error)."""
        token = get_user1_token()
        resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Tiny Radius", unlock_radius=5),
            headers=auth_headers(token),
        )
        assert resp.status_code == 422

    def test_radius_too_large(self):
        """Radius above 100 is rejected (422 validation error)."""
        token = get_user1_token()
        resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Huge Radius", unlock_radius=150),
            headers=auth_headers(token),
        )
        assert resp.status_code == 422

    def test_edit_radius_within_range(self):
        """PATCH with valid radius updates it."""
        token = get_user1_token()
        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Edit Radius"),
            headers=auth_headers(token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        edit_resp = client.patch(
            f"/anchors/{anchor_id}",
            json={"unlock_radius": 30},
            headers=auth_headers(token),
        )
        assert edit_resp.status_code == 200
        assert edit_resp.json()["unlock_radius"] == 30

    def test_edit_radius_too_small(self):
        """PATCH with radius below 10 is rejected."""
        token = get_user1_token()
        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Edit Bad Radius"),
            headers=auth_headers(token),
        )
        anchor_id = create_resp.json()["anchor_id"]

        edit_resp = client.patch(
            f"/anchors/{anchor_id}",
            json={"unlock_radius": 3},
            headers=auth_headers(token),
        )
        assert edit_resp.status_code == 422


# ── Visibility Tests (US7 #3, US5 #7) ────────────────────────────────────────

class TestAnchorVisibility:

    def test_public_anchor_visible_to_others(self):
        """US5 #7 — User2 can see User1's PUBLIC anchor via nearby endpoint."""
        owner_token = get_user1_token()
        other_token = get_user2_token()

        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Visible Public", visibility="PUBLIC"),
            headers=auth_headers(owner_token),
        )
        assert create_resp.status_code == 201

        nearby_resp = client.get(
            "/anchors/nearby",
            params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50},
            headers=auth_headers(other_token),
        )
        assert nearby_resp.status_code == 200
        titles = [a["title"] for a in nearby_resp.json()]
        assert "Visible Public" in titles

    def test_private_anchor_not_visible_to_others(self):
        """US7 #3 — User2 cannot see User1's PRIVATE anchor via nearby endpoint."""
        owner_token = get_user1_token()
        other_token = get_user2_token()

        create_resp = client.post(
            "/anchors/",
            json=make_anchor_payload(title="Hidden Private", visibility="PRIVATE"),
            headers=auth_headers(owner_token),
        )
        assert create_resp.status_code == 201

        nearby_resp = client.get(
            "/anchors/nearby",
            params={
                "lat": 40.4237,
                "lon": -86.9212,
                "radius_km": 50,
                "visibility": "PRIVATE",
            },
            headers=auth_headers(other_token),
        )
        assert nearby_resp.status_code == 200
        # User2 should not see User1's private anchors
        for anchor in nearby_resp.json():
            assert anchor["title"] != "Hidden Private" or anchor["creator_id"] != create_resp.json()["creator_id"]
