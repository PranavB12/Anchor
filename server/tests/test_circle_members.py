"""
US7 #4 — Unit tests for Circle membership management

Tests:
    - Only the circle owner can invite members
    - Only the circle owner can remove members
    - Duplicate invite attempts are rejected with 409
    - Removed members lose access to the members list
    - Non-members cannot view the members list
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db
from sqlalchemy import text

client = TestClient(app)

_token_cache = None
_user_id_cache = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_token():
    global _token_cache, _user_id_cache
    if _token_cache:
        return _token_cache
    response = client.post("/auth/login", json={
        "email": "user2@example.com",
        "password": "testpass123",
    })
    assert response.status_code == 200
    data = response.json()
    _token_cache = data["access_token"]
    _user_id_cache = data["user_id"]
    return _token_cache


def get_user_id():
    get_token()
    return _user_id_cache


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_test_circle(token: str) -> str:
    """Create a circle directly in the DB and return its circle_id."""
    circle_id = str(uuid.uuid4())
    user_id = get_user_id()
    db = next(get_db())
    db.execute(
        text("""
            INSERT INTO circles (circle_id, owner_id, name, description, visibility)
            VALUES (:circle_id, :owner_id, :name, :description, :visibility)
        """),
        {
            "circle_id": circle_id,
            "owner_id": user_id,
            "name": "Test Circle",
            "description": "A test circle",
            "visibility": "PRIVATE",
        },
    )
    db.commit()
    return circle_id


def create_second_user() -> tuple[str, str]:
    """Register a second user and return (user_id, token)."""
    username = f"testuser_{uuid.uuid4().hex[:8]}"
    email = f"{username}@test.com"
    response = client.post("/auth/register", json={
        "email": email,
        "password": "testpass123",
        "username": username,
    })
    assert response.status_code == 201
    data = response.json()
    return data["user_id"], data["access_token"], username


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCircleMembers:

    @classmethod
    def setup_class(cls):
        from app.core.security import hash_password
        import uuid
        db = next(get_db())
        existing = db.execute(
            text("SELECT user_id FROM users WHERE email = :email"),
            {"email": "user2@example.com"}
        ).fetchone()
        if not existing:
            db.execute(
                text("""
                    INSERT INTO users (user_id, email, password_hash, username)
                    VALUES (:user_id, :email, :password_hash, :username)
                """),
                {
                    "user_id": str(uuid.uuid4()),
                    "email": "user2@example.com",
                    "password_hash": hash_password("testpass123"),
                    "username": "user2testowner",
                }
            )
            db.commit()

    def test_owner_can_invite_member(self):
        """Circle owner can successfully invite a user by username."""
        token = get_token()
        circle_id = create_test_circle(token)
        _, _, username = create_second_user()

        response = client.post(
            f"/circles/{circle_id}/members",
            json={"username": username},
            headers=auth_headers(token),
        )
        assert response.status_code == 201
        assert "added" in response.json()["message"].lower()

    def test_non_owner_cannot_invite_member(self):
        """Non-owner cannot invite members — returns 403."""
        token = get_token()
        circle_id = create_test_circle(token)
        _, other_token, username = create_second_user()
        _, _, third_username = create_second_user()

        # First add the second user as a member
        client.post(
            f"/circles/{circle_id}/members",
            json={"username": username},
            headers=auth_headers(token),
        )

        # Second user tries to invite a third user — should fail
        response = client.post(
            f"/circles/{circle_id}/members",
            json={"username": third_username},
            headers=auth_headers(other_token),
        )
        assert response.status_code == 403

    def test_duplicate_invite_returns_409(self):
        """Inviting a user who is already a member returns 409."""
        token = get_token()
        circle_id = create_test_circle(token)
        _, _, username = create_second_user()

        # First invite
        client.post(
            f"/circles/{circle_id}/members",
            json={"username": username},
            headers=auth_headers(token),
        )

        # Duplicate invite
        response = client.post(
            f"/circles/{circle_id}/members",
            json={"username": username},
            headers=auth_headers(token),
        )
        assert response.status_code == 409

    def test_owner_can_remove_member(self):
        """Circle owner can remove an existing member."""
        token = get_token()
        circle_id = create_test_circle(token)
        other_user_id, _, username = create_second_user()

        # Invite first
        client.post(
            f"/circles/{circle_id}/members",
            json={"username": username},
            headers=auth_headers(token),
        )

        # Remove
        response = client.delete(
            f"/circles/{circle_id}/members/{other_user_id}",
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        assert "removed" in response.json()["message"].lower()

    def test_non_owner_cannot_remove_member(self):
        """Non-owner cannot remove members — returns 403."""
        token = get_token()
        circle_id = create_test_circle(token)
        other_user_id, other_token, username = create_second_user()

        # Invite second user
        client.post(
            f"/circles/{circle_id}/members",
            json={"username": username},
            headers=auth_headers(token),
        )

        # Second user tries to remove themselves — should fail
        response = client.delete(
            f"/circles/{circle_id}/members/{other_user_id}",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 403

    def test_removed_member_cannot_view_members(self):
        """After removal, a user can no longer view the members list."""
        token = get_token()
        circle_id = create_test_circle(token)
        other_user_id, other_token, username = create_second_user()

        # Invite
        client.post(
            f"/circles/{circle_id}/members",
            json={"username": username},
            headers=auth_headers(token),
        )

        # Verify they can view members
        response = client.get(
            f"/circles/{circle_id}/members",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 200

        # Remove them
        client.delete(
            f"/circles/{circle_id}/members/{other_user_id}",
            headers=auth_headers(token),
        )

        # Now they should be denied
        response = client.get(
            f"/circles/{circle_id}/members",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 403

    def test_invite_nonexistent_user_returns_404(self):
        """Inviting a username that does not exist returns 404."""
        token = get_token()
        circle_id = create_test_circle(token)

        response = client.post(
            f"/circles/{circle_id}/members",
            json={"username": "thisuserdoesnotexist_xyz"},
            headers=auth_headers(token),
        )
        assert response.status_code == 404

    def test_requires_authentication(self):
        """Returns 401 when no token is provided."""
        token = get_token()
        circle_id = create_test_circle(token)

        response = client.get(f"/circles/{circle_id}/members")
        assert response.status_code == 401