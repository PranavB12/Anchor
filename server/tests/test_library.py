"""
US3 #5 — Automated tests for the Personal Library (saved anchors) endpoints.

Tests:
    - Save an existing anchor returns 201 with full anchor payload + saved_at
    - Save requires auth
    - Save on nonexistent anchor returns 404
    - Duplicate save returns 409 (composite PK constraint)
    - GET /user/library lists every saved anchor for the caller
    - GET requires auth
    - GET returns newest-saved first
    - Each user sees only their own library (isolation)
    - DELETE removes the anchor from the library
    - DELETE requires auth
    - DELETE on anchor that is not saved returns 404
    - Saved anchors are returned regardless of caller location (access-anywhere)
"""

import time

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


_user1_token = None
_user2_token = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_user1_token():
    global _user1_token
    if _user1_token:
        return _user1_token
    resp = client.post("/auth/register", json={
        "email": "testlibrary1@example.com",
        "password": "testpass123",
        "username": "testlibrary1",
    })
    if resp.status_code == 201:
        _user1_token = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "testlibrary1@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _user1_token = resp.json()["access_token"]
    return _user1_token


def get_user2_token():
    global _user2_token
    if _user2_token:
        return _user2_token
    resp = client.post("/auth/register", json={
        "email": "testlibrary2@example.com",
        "password": "testpass123",
        "username": "testlibrary2",
    })
    if resp.status_code == 201:
        _user2_token = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "testlibrary2@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _user2_token = resp.json()["access_token"]
    return _user2_token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_anchor(token: str, **overrides) -> dict:
    payload = {
        "title": "Library Test Anchor",
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


def clear_library(token: str):
    """Remove every currently-saved anchor for the caller."""
    resp = client.get("/user/library", headers=auth_headers(token))
    assert resp.status_code == 200
    for saved in resp.json():
        client.delete(
            f"/user/library/{saved['anchor_id']}",
            headers=auth_headers(token),
        )


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestSaveAnchor:

    def test_save_success(self):
        """POST /user/library/save returns 201 with full anchor + saved_at."""
        token = get_user1_token()
        clear_library(token)
        anchor = create_anchor(token, title="Savable One")

        resp = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["anchor_id"] == anchor["anchor_id"]
        assert data["title"] == "Savable One"
        assert data["latitude"] == anchor["latitude"]
        assert data["longitude"] == anchor["longitude"]
        assert "saved_at" in data

    def test_save_requires_auth(self):
        """POST /user/library/save without a bearer token is rejected."""
        token = get_user1_token()
        anchor = create_anchor(token, title="Needs Auth")

        resp = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
        )
        assert resp.status_code in (401, 403)

    def test_save_nonexistent_anchor(self):
        """Saving an anchor that does not exist returns 404."""
        token = get_user1_token()
        resp = client.post(
            "/user/library/save",
            json={"anchor_id": "00000000-0000-0000-0000-000000000000"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 404

    def test_save_duplicate_returns_409(self):
        """Saving an anchor the caller has already saved returns 409."""
        token = get_user1_token()
        clear_library(token)
        anchor = create_anchor(token, title="Duplicate Save")

        first = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(token),
        )
        assert first.status_code == 201

        second = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(token),
        )
        assert second.status_code == 409


class TestListLibrary:

    def test_list_returns_saved_anchors(self):
        """GET /user/library returns every saved anchor for the caller."""
        token = get_user1_token()
        clear_library(token)
        anchor_a = create_anchor(token, title="Library A")
        anchor_b = create_anchor(token, title="Library B")

        client.post(
            "/user/library/save",
            json={"anchor_id": anchor_a["anchor_id"]},
            headers=auth_headers(token),
        )
        client.post(
            "/user/library/save",
            json={"anchor_id": anchor_b["anchor_id"]},
            headers=auth_headers(token),
        )

        resp = client.get("/user/library", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        ids = {item["anchor_id"] for item in data}
        assert anchor_a["anchor_id"] in ids
        assert anchor_b["anchor_id"] in ids

    def test_list_requires_auth(self):
        """GET /user/library without a token is rejected."""
        resp = client.get("/user/library")
        assert resp.status_code in (401, 403)

    def test_list_sorted_newest_first(self):
        """GET /user/library returns newest-saved anchors first."""
        token = get_user1_token()
        clear_library(token)
        anchor_old = create_anchor(token, title="Older Save")
        anchor_new = create_anchor(token, title="Newer Save")

        client.post(
            "/user/library/save",
            json={"anchor_id": anchor_old["anchor_id"]},
            headers=auth_headers(token),
        )
        # Small delay so saved_at timestamps differ — MySQL DATETIME is 1s granularity
        time.sleep(1.1)
        client.post(
            "/user/library/save",
            json={"anchor_id": anchor_new["anchor_id"]},
            headers=auth_headers(token),
        )

        resp = client.get("/user/library", headers=auth_headers(token))
        assert resp.status_code == 200
        ids_in_order = [item["anchor_id"] for item in resp.json()]
        assert ids_in_order.index(anchor_new["anchor_id"]) < ids_in_order.index(
            anchor_old["anchor_id"]
        )

    def test_library_is_per_user(self):
        """User B's saves must not appear in User A's library."""
        token_a = get_user1_token()
        token_b = get_user2_token()
        clear_library(token_a)
        clear_library(token_b)

        anchor = create_anchor(token_b, title="Only In B's Library")
        save = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(token_b),
        )
        assert save.status_code == 201

        resp_a = client.get("/user/library", headers=auth_headers(token_a))
        assert resp_a.status_code == 200
        assert all(item["anchor_id"] != anchor["anchor_id"] for item in resp_a.json())

        resp_b = client.get("/user/library", headers=auth_headers(token_b))
        assert resp_b.status_code == 200
        assert any(item["anchor_id"] == anchor["anchor_id"] for item in resp_b.json())


class TestRemoveFromLibrary:

    def test_remove_success(self):
        """DELETE /user/library/{anchor_id} removes the anchor from the library."""
        token = get_user1_token()
        clear_library(token)
        anchor = create_anchor(token, title="To Remove")

        client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(token),
        )

        resp = client.delete(
            f"/user/library/{anchor['anchor_id']}",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200

        listing = client.get("/user/library", headers=auth_headers(token))
        assert listing.status_code == 200
        assert all(item["anchor_id"] != anchor["anchor_id"] for item in listing.json())

    def test_remove_requires_auth(self):
        """DELETE without a token is rejected."""
        token = get_user1_token()
        anchor = create_anchor(token, title="Remove Auth Check")
        client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(token),
        )

        resp = client.delete(f"/user/library/{anchor['anchor_id']}")
        assert resp.status_code in (401, 403)

    def test_remove_not_saved_returns_404(self):
        """DELETE for an anchor that isn't in the library returns 404."""
        token = get_user1_token()
        clear_library(token)
        anchor = create_anchor(token, title="Never Saved")

        resp = client.delete(
            f"/user/library/{anchor['anchor_id']}",
            headers=auth_headers(token),
        )
        assert resp.status_code == 404


class TestAccessAnywhere:

    def test_saved_anchors_returned_regardless_of_location(self):
        """AC #2 — Saved anchors appear in GET /user/library with no proximity filter."""
        token = get_user1_token()
        clear_library(token)

        # Anchor at Purdue; the /user/library endpoint takes no lat/lon params at all,
        # so location is never considered — the list should come back with the anchor.
        anchor = create_anchor(
            token,
            title="Far-Away Save",
            latitude=40.4237,
            longitude=-86.9212,
        )
        save = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(token),
        )
        assert save.status_code == 201

        resp = client.get("/user/library", headers=auth_headers(token))
        assert resp.status_code == 200
        assert any(item["anchor_id"] == anchor["anchor_id"] for item in resp.json())
