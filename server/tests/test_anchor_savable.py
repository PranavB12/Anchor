"""
US2 #5 — Automated tests for the is_savable constraint on anchors.

Tests:
    - POST /anchors defaults is_savable to True when not supplied
    - POST /anchors persists is_savable=False when explicitly requested
    - POST /anchors persists is_savable=True when explicitly requested
    - POST /user/library/save returns 403 on an is_savable=False anchor
    - POST /user/library/save succeeds on an is_savable=True anchor
    - The unsavable save-rejection does not leave a saved_anchors row
    - PATCH /anchors/{id} can toggle is_savable False -> True (AC #3)
    - After toggling back to True, the anchor becomes savable again
    - PATCH /anchors/{id} can toggle is_savable True -> False
    - After toggling to False, a non-creator can no longer save the anchor
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


_owner_token = None
_viewer_token = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_owner_token():
    global _owner_token
    if _owner_token:
        return _owner_token
    resp = client.post("/auth/register", json={
        "email": "savableowner@example.com",
        "password": "testpass123",
        "username": "savableowner",
    })
    if resp.status_code == 201:
        _owner_token = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "savableowner@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _owner_token = resp.json()["access_token"]
    return _owner_token


def get_viewer_token():
    global _viewer_token
    if _viewer_token:
        return _viewer_token
    resp = client.post("/auth/register", json={
        "email": "savableviewer@example.com",
        "password": "testpass123",
        "username": "savableviewer",
    })
    if resp.status_code == 201:
        _viewer_token = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "savableviewer@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _viewer_token = resp.json()["access_token"]
    return _viewer_token


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_anchor(token: str, **overrides) -> dict:
    payload = {
        "title": "Savable Test Anchor",
        "latitude": 40.4237,
        "longitude": -86.9212,
        "visibility": "PUBLIC",
        "unlock_radius": 50,
        "always_active": True,
    }
    payload.update(overrides)
    resp = client.post("/anchors/", json=payload, headers=auth_headers(token))
    assert resp.status_code == 201, resp.text
    return resp.json()


def clear_library(token: str):
    resp = client.get("/user/library", headers=auth_headers(token))
    assert resp.status_code == 200
    for saved in resp.json():
        client.delete(
            f"/user/library/{saved['anchor_id']}",
            headers=auth_headers(token),
        )


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCreateAnchorSavableField:

    def test_defaults_to_true(self):
        """POST /anchors with no is_savable field defaults to True."""
        token = get_owner_token()
        anchor = create_anchor(token, title="Default Savable")
        assert anchor["is_savable"] is True

    def test_explicit_false_persists(self):
        """POST /anchors with is_savable=False persists as False."""
        token = get_owner_token()
        anchor = create_anchor(token, title="Unsavable One", is_savable=False)
        assert anchor["is_savable"] is False

    def test_explicit_true_persists(self):
        """POST /anchors with is_savable=True persists as True."""
        token = get_owner_token()
        anchor = create_anchor(token, title="Savable One", is_savable=True)
        assert anchor["is_savable"] is True


class TestSaveEndpointRespectsIsSavable:

    def test_save_rejected_on_unsavable_anchor(self):
        """POST /user/library/save returns 403 when target anchor has is_savable=False."""
        owner_token = get_owner_token()
        viewer_token = get_viewer_token()
        clear_library(viewer_token)

        anchor = create_anchor(
            owner_token,
            title="Private Thoughts",
            is_savable=False,
        )

        resp = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(viewer_token),
        )
        assert resp.status_code == 403
        assert "cannot be saved" in resp.json()["detail"].lower()

    def test_save_succeeds_on_savable_anchor(self):
        """POST /user/library/save returns 201 for is_savable=True anchors."""
        owner_token = get_owner_token()
        viewer_token = get_viewer_token()
        clear_library(viewer_token)

        anchor = create_anchor(
            owner_token,
            title="Open To All",
            is_savable=True,
        )

        resp = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(viewer_token),
        )
        assert resp.status_code == 201

    def test_rejected_save_does_not_persist(self):
        """403 on an unsavable anchor must leave no saved_anchors row behind."""
        owner_token = get_owner_token()
        viewer_token = get_viewer_token()
        clear_library(viewer_token)

        anchor = create_anchor(
            owner_token,
            title="Locked Down",
            is_savable=False,
        )

        save_resp = client.post(
            "/user/library/save",
            json={"anchor_id": anchor["anchor_id"]},
            headers=auth_headers(viewer_token),
        )
        assert save_resp.status_code == 403

        list_resp = client.get("/user/library", headers=auth_headers(viewer_token))
        assert list_resp.status_code == 200
        assert all(
            item["anchor_id"] != anchor["anchor_id"]
            for item in list_resp.json()
        )


class TestToggleIsSavableViaPatch:

    def test_patch_false_to_true_allows_saving_again(self):
        """AC #3 — flipping is_savable back to True re-enables saving by others."""
        owner_token = get_owner_token()
        viewer_token = get_viewer_token()
        clear_library(viewer_token)

        anchor = create_anchor(
            owner_token,
            title="Flip Me",
            is_savable=False,
        )
        anchor_id = anchor["anchor_id"]

        # Initially unsavable → save should fail
        blocked = client.post(
            "/user/library/save",
            json={"anchor_id": anchor_id},
            headers=auth_headers(viewer_token),
        )
        assert blocked.status_code == 403

        # Owner toggles to savable
        patch = client.patch(
            f"/anchors/{anchor_id}",
            json={"is_savable": True},
            headers=auth_headers(owner_token),
        )
        assert patch.status_code == 200
        assert patch.json()["is_savable"] is True

        # Now the save should succeed
        allowed = client.post(
            "/user/library/save",
            json={"anchor_id": anchor_id},
            headers=auth_headers(viewer_token),
        )
        assert allowed.status_code == 201

    def test_patch_true_to_false_blocks_future_saves(self):
        """Flipping is_savable to False must start blocking new saves immediately."""
        owner_token = get_owner_token()
        viewer_token = get_viewer_token()
        clear_library(viewer_token)

        anchor = create_anchor(
            owner_token,
            title="Will Lock",
            is_savable=True,
        )
        anchor_id = anchor["anchor_id"]

        # Initially savable
        first = client.post(
            "/user/library/save",
            json={"anchor_id": anchor_id},
            headers=auth_headers(viewer_token),
        )
        assert first.status_code == 201

        # Another user hasn't saved yet → remove this save to isolate the next check
        remove = client.delete(
            f"/user/library/{anchor_id}",
            headers=auth_headers(viewer_token),
        )
        assert remove.status_code == 200

        # Owner locks it down
        patch = client.patch(
            f"/anchors/{anchor_id}",
            json={"is_savable": False},
            headers=auth_headers(owner_token),
        )
        assert patch.status_code == 200
        assert patch.json()["is_savable"] is False

        # Now the save should be blocked
        blocked = client.post(
            "/user/library/save",
            json={"anchor_id": anchor_id},
            headers=auth_headers(viewer_token),
        )
        assert blocked.status_code == 403
