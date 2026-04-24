import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.database import SessionLocal
from app.main import app

client = TestClient(app)
_token_cache: dict[str, str] = {}


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def get_token(email: str, username: str, password: str = "testpass123") -> str:
    if email in _token_cache:
        return _token_cache[email]

    response = client.post(
        "/auth/register",
        json={"email": email, "password": password, "username": username},
    )
    if response.status_code == 201:
        _token_cache[email] = response.json()["access_token"]
        return _token_cache[email]

    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    _token_cache[email] = response.json()["access_token"]
    return _token_cache[email]


def get_user_id(email: str) -> str:
    db = SessionLocal()
    try:
        row = db.execute(
            text("SELECT user_id FROM users WHERE email = :email"),
            {"email": email},
        ).fetchone()
        assert row is not None
        return row.user_id
    finally:
        db.close()


def create_circle(
    token: str,
    name: str,
    visibility: str = "PRIVATE",
    description: Optional[str] = None,
) -> dict:
    response = client.post(
        "/circles/",
        json={
            "name": name,
            "description": description,
            "visibility": visibility,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_anchor(token: str, title: str, circle_id: str) -> dict:
    response = client.post(
        "/anchors/",
        json={
            "title": title,
            "description": "Circle-only anchor",
            "latitude": 40.4237,
            "longitude": -86.9212,
            "visibility": "CIRCLE_ONLY",
            "circle_id": circle_id,
            "unlock_radius": 50,
            "activation_time": (
                datetime.now(timezone.utc) - timedelta(minutes=1)
            ).isoformat(),
            "always_active": True,
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


def nearby_titles(token: str) -> list[str]:
    response = client.get(
        "/anchors/nearby",
        params={"lat": 40.4237, "lon": -86.9212, "radius_km": 50},
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    return [anchor["title"] for anchor in response.json()]


class TestCircleCreation:

    def test_create_circle_success_persists_owner_membership(self):
        email = f"circle-owner-{uuid.uuid4().hex[:8]}@example.com"
        token = get_token(email, f"circle_owner_{uuid.uuid4().hex[:8]}")
        owner_id = get_user_id(email)

        response = client.post(
            "/circles/",
            json={
                "name": "Launch Crew",
                "description": "People reviewing launch anchors",
                "visibility": "PRIVATE",
            },
            headers=auth_headers(token),
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Launch Crew"
        assert data["description"] == "People reviewing launch anchors"
        assert data["visibility"] == "PRIVATE"
        assert data["owner_id"] == owner_id
        assert data["member_count"] == 1
        assert data["is_owner"] is True

        db = SessionLocal()
        try:
            circle_row = db.execute(
                text("SELECT owner_id, name, visibility FROM circles WHERE circle_id = :circle_id"),
                {"circle_id": data["circle_id"]},
            ).fetchone()
            membership_row = db.execute(
                text(
                    """
                    SELECT 1
                    FROM circle_members
                    WHERE circle_id = :circle_id AND user_id = :user_id
                    """
                ),
                {"circle_id": data["circle_id"], "user_id": owner_id},
            ).fetchone()
            assert circle_row is not None
            assert circle_row.owner_id == owner_id
            assert circle_row.name == "Launch Crew"
            assert circle_row.visibility == "PRIVATE"
            assert membership_row is not None
        finally:
            db.close()

    def test_create_circle_rejects_invalid_payload(self):
        email = f"circle-invalid-{uuid.uuid4().hex[:8]}@example.com"
        token = get_token(email, f"circle_invalid_{uuid.uuid4().hex[:8]}")

        blank_name = client.post(
            "/circles/",
            json={"name": "   ", "description": "Nope", "visibility": "PRIVATE"},
            headers=auth_headers(token),
        )
        invalid_visibility = client.post(
            "/circles/",
            json={"name": "Bad Circle", "description": "Nope", "visibility": "SECRET"},
            headers=auth_headers(token),
        )

        assert blank_name.status_code == 422
        assert invalid_visibility.status_code == 422

    def test_get_circles_returns_owned_and_joined(self):
        owner_email = f"circle-owned-{uuid.uuid4().hex[:8]}@example.com"
        other_email = f"circle-joined-{uuid.uuid4().hex[:8]}@example.com"
        owner_token = get_token(owner_email, f"owner_{uuid.uuid4().hex[:8]}")
        other_token = get_token(other_email, f"joiner_{uuid.uuid4().hex[:8]}")

        owned_circle = create_circle(owner_token, "Owned Circle", "PRIVATE", "Created by owner")
        joined_circle = create_circle(other_token, "Joined Circle", "PUBLIC", "Created by someone else")

        join_response = client.post(
            f"/circles/{joined_circle['circle_id']}/join",
            headers=auth_headers(owner_token),
        )
        assert join_response.status_code == 201, join_response.text

        response = client.get("/circles/", headers=auth_headers(owner_token))
        assert response.status_code == 200
        circles = response.json()

        owned_match = next(circle for circle in circles if circle["circle_id"] == owned_circle["circle_id"])
        joined_match = next(circle for circle in circles if circle["circle_id"] == joined_circle["circle_id"])

        assert owned_match["name"] == "Owned Circle"
        assert owned_match["is_owner"] is True
        assert owned_match["owner_id"] == get_user_id(owner_email)

        assert joined_match["name"] == "Joined Circle"
        assert joined_match["is_owner"] is False
        assert joined_match["owner_id"] == get_user_id(other_email)


class TestCircleAnchorAccess:

    def test_private_circle_anchor_visible_only_to_invited_members(self):
        owner_email = f"private-owner-{uuid.uuid4().hex[:8]}@example.com"
        member_email = f"private-member-{uuid.uuid4().hex[:8]}@example.com"
        outsider_email = f"private-outsider-{uuid.uuid4().hex[:8]}@example.com"
        owner_username = f"private_owner_{uuid.uuid4().hex[:8]}"
        member_username = f"private_member_{uuid.uuid4().hex[:8]}"
        outsider_username = f"private_outsider_{uuid.uuid4().hex[:8]}"

        owner_token = get_token(owner_email, owner_username)
        member_token = get_token(member_email, member_username)
        outsider_token = get_token(outsider_email, outsider_username)

        circle = create_circle(owner_token, "Private Access Circle", "PRIVATE")
        invite_response = client.post(
            f"/circles/{circle['circle_id']}/members",
            json={"username": member_username},
            headers=auth_headers(owner_token),
        )
        assert invite_response.status_code == 201, invite_response.text

        anchor_title = f"Private Circle Anchor {uuid.uuid4().hex[:6]}"
        anchor = create_anchor(owner_token, anchor_title, circle["circle_id"])
        assert anchor["circle_id"] == circle["circle_id"]

        assert anchor_title in nearby_titles(member_token)
        assert anchor_title not in nearby_titles(outsider_token)

    def test_public_circle_anchor_visible_only_after_joining(self):
        owner_email = f"public-owner-{uuid.uuid4().hex[:8]}@example.com"
        member_email = f"public-member-{uuid.uuid4().hex[:8]}@example.com"
        outsider_email = f"public-outsider-{uuid.uuid4().hex[:8]}@example.com"

        owner_token = get_token(owner_email, f"public_owner_{uuid.uuid4().hex[:8]}")
        member_token = get_token(member_email, f"public_member_{uuid.uuid4().hex[:8]}")
        outsider_token = get_token(outsider_email, f"public_outsider_{uuid.uuid4().hex[:8]}")

        circle = create_circle(owner_token, "Public Access Circle", "PUBLIC")

        join_response = client.post(
            f"/circles/{circle['circle_id']}/join",
            headers=auth_headers(member_token),
        )
        assert join_response.status_code == 201, join_response.text

        anchor_title = f"Public Circle Anchor {uuid.uuid4().hex[:6]}"
        anchor = create_anchor(owner_token, anchor_title, circle["circle_id"])
        assert anchor["circle_id"] == circle["circle_id"]

        assert anchor_title in nearby_titles(member_token)
        assert anchor_title not in nearby_titles(outsider_token)
