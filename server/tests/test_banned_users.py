"""
Integration coverage for account banning.

Coverage:
- Admin ban endpoint updates users.is_banned.
- Banned users are blocked from login, refresh, and protected routes.
- Anchors created by banned users are hidden from nearby discovery.
"""

import os
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import text

# Ensure settings parse in test environments even if local .env has non-boolean DEBUG.
os.environ["DEBUG"] = "false"

from app.core.database import SessionLocal
from app.main import app

client = TestClient(app)


def register_user(prefix: str):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"{prefix}-{suffix}@example.com",
        "password": "testpass123",
        "username": f"{prefix}_{suffix}",
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    return {**payload, **response.json()}


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def set_admin(user_id: str, is_admin: bool = True):
    db = SessionLocal()
    try:
        db.execute(
            text("""
                UPDATE users
                SET is_admin = :is_admin
                WHERE user_id = :user_id
            """),
            {"is_admin": is_admin, "user_id": user_id},
        )
        db.commit()
    finally:
        db.close()


def fetch_ban_state(user_id: str) -> bool:
    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT is_banned FROM users WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).fetchone()
        assert row is not None
        return bool(row.is_banned)
    finally:
        db.close()


def ban_user(admin_token: str, target_user_id: str, is_banned: bool = True):
    return client.post(
        f"/admin/users/{target_user_id}/ban",
        json={"is_banned": is_banned},
        headers=auth_headers(admin_token),
    )


def create_anchor(token: str, title: str, lat: float, lon: float):
    response = client.post(
        "/anchors/",
        json={
            "title": title,
            "description": "Anchor created for banned-user visibility tests.",
            "latitude": lat,
            "longitude": lon,
            "visibility": "PUBLIC",
            "unlock_radius": 75,
            "always_active": True,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()


def nearby_anchor_ids(token: str, lat: float, lon: float) -> list[str]:
    response = client.get(
        "/anchors/nearby",
        params={"lat": lat, "lon": lon, "radius_km": 10},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    return [anchor["anchor_id"] for anchor in response.json()]


def test_admin_ban_endpoint_updates_database():
    admin = register_user("banadmin")
    target = register_user("bantarget")
    set_admin(admin["user_id"])

    response = ban_user(admin["access_token"], target["user_id"], True)

    assert response.status_code == 200
    assert response.json()["is_banned"] is True
    assert fetch_ban_state(target["user_id"]) is True


def test_banned_user_login_and_refresh_return_disabled_account_error():
    admin = register_user("authadmin")
    banned_user = register_user("bannedauth")
    set_admin(admin["user_id"])

    ban_response = ban_user(admin["access_token"], banned_user["user_id"], True)
    assert ban_response.status_code == 200

    login_response = client.post(
        "/auth/login",
        json={
            "email": banned_user["email"],
            "password": banned_user["password"],
        },
    )
    assert login_response.status_code == 403
    assert "disabled" in login_response.json()["detail"].lower()

    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": banned_user["refresh_token"]},
    )
    assert refresh_response.status_code == 403
    assert "disabled" in refresh_response.json()["detail"].lower()


def test_banned_access_tokens_are_rejected_on_standard_routes():
    admin = register_user("routeadmin")
    banned_user = register_user("routetarget")
    set_admin(admin["user_id"])

    ban_response = ban_user(admin["access_token"], banned_user["user_id"], True)
    assert ban_response.status_code == 200

    verify_response = client.get(
        "/auth/verify",
        headers=auth_headers(banned_user["access_token"]),
    )
    assert verify_response.status_code == 403
    assert "disabled" in verify_response.json()["detail"].lower()

    profile_response = client.get(
        "/user/profile",
        headers=auth_headers(banned_user["access_token"]),
    )
    assert profile_response.status_code == 403
    assert "disabled" in profile_response.json()["detail"].lower()


def test_banned_users_existing_anchors_are_hidden_from_nearby_discovery():
    admin = register_user("mapadmin")
    creator = register_user("bannedcreator")
    viewer = register_user("viewer")
    set_admin(admin["user_id"])

    anchor = create_anchor(
        creator["access_token"],
        title="Banned Creator Anchor",
        lat=40.4237,
        lon=-86.9212,
    )

    assert anchor["anchor_id"] in nearby_anchor_ids(viewer["access_token"], 40.4237, -86.9212)

    ban_response = ban_user(admin["access_token"], creator["user_id"], True)
    assert ban_response.status_code == 200

    assert anchor["anchor_id"] not in nearby_anchor_ids(
        viewer["access_token"],
        40.4237,
        -86.9212,
    )
