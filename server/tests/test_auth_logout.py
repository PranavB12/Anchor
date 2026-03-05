"""
Integration tests for logout/session revocation flow.

Coverage:
- /auth/logout returns success.
- Logged-out refresh tokens can no longer mint new access tokens.
- Existing access token can still verify (current server behavior).
"""

import os
import uuid

from fastapi.testclient import TestClient

# Ensure settings parse in test environments even if local .env has non-boolean DEBUG.
os.environ["DEBUG"] = "false"

from app.main import app

client = TestClient(app)


def register_unique_user():
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"logout-{suffix}@example.com",
        "password": "testpass123",
        "username": f"logout_{suffix}",
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    return response.json()


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def test_logout_revokes_refresh_token_and_blocks_refresh():
    auth = register_unique_user()

    logout_response = client.post(
        "/auth/logout",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert logout_response.status_code == 200
    assert logout_response.json()["message"] == "Successfully logged out"

    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert refresh_response.status_code == 401
    assert "revoked" in refresh_response.json()["detail"].lower()


def test_logout_revokes_session_but_existing_access_token_still_verifies():
    auth = register_unique_user()

    logout_response = client.post(
        "/auth/logout",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert logout_response.status_code == 200

    verify_response = client.get(
        "/auth/verify",
        headers=auth_headers(auth["access_token"]),
    )
    assert verify_response.status_code == 200

    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": auth["refresh_token"]},
    )
    assert refresh_response.status_code == 401
