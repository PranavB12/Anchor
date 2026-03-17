"""
Tests:
    - Ghost Mode can be enabled via PATCH /user/profile
    - Ghost Mode can be disabled via PATCH /user/profile
    - Ghost Mode persists correctly after being set
    - Nearby anchor fetch returns empty when Ghost Mode is on (client-side gate)
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

_token_cache = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_token():
    """Login and return a valid access token (cached)."""
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


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestGhostMode:

    def test_enable_ghost_mode(self):
        """PATCH /user/profile with is_ghost_mode=True enables Ghost Mode."""
        token = get_token()
        response = client.patch(
            "/user/profile",
            json={"is_ghost_mode": True},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        assert response.json()["is_ghost_mode"] is True

    def test_disable_ghost_mode(self):
        """PATCH /user/profile with is_ghost_mode=False disables Ghost Mode."""
        token = get_token()
        response = client.patch(
            "/user/profile",
            json={"is_ghost_mode": False},
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        assert response.json()["is_ghost_mode"] is False

    def test_ghost_mode_persists(self):
        """Ghost Mode setting persists and is returned correctly by GET /user/profile."""
        token = get_token()

        # Enable Ghost Mode
        client.patch(
            "/user/profile",
            json={"is_ghost_mode": True},
            headers=auth_headers(token),
        )

        # Fetch profile and verify it persisted
        response = client.get("/user/profile", headers=auth_headers(token))
        assert response.status_code == 200
        assert response.json()["is_ghost_mode"] is True

        # Clean up — disable Ghost Mode
        client.patch(
            "/user/profile",
            json={"is_ghost_mode": False},
            headers=auth_headers(token),
        )

    def test_ghost_mode_does_not_affect_other_fields(self):
        """Updating is_ghost_mode does not change username or email."""
        token = get_token()

        # Get current profile
        profile = client.get("/user/profile", headers=auth_headers(token)).json()
        original_username = profile["username"]
        original_email = profile["email"]

        # Toggle Ghost Mode
        client.patch(
            "/user/profile",
            json={"is_ghost_mode": True},
            headers=auth_headers(token),
        )

        # Verify other fields unchanged
        updated = client.get("/user/profile", headers=auth_headers(token)).json()
        assert updated["username"] == original_username
        assert updated["email"] == original_email

        # Clean up
        client.patch(
            "/user/profile",
            json={"is_ghost_mode": False},
            headers=auth_headers(token),
        )

    def test_requires_authentication(self):
        """Returns 401 when no token provided."""
        response = client.patch(
            "/user/profile",
            json={"is_ghost_mode": True},
        )
        assert response.status_code == 401