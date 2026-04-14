"""
US8 #4 — Unit tests for Circle Global Search

Tests:
    - Search returns only PUBLIC circles
    - Partial name matches work correctly
    - Private circles never appear in results
    - Joining a public circle works
    - Joining a private circle is rejected
    - Already joined circles show is_member = True
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


def create_circle(token: str, name: str, visibility: str = "PUBLIC") -> str:
    """Create a circle directly in DB and return circle_id."""
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
            "name": name,
            "description": f"Description for {name}",
            "visibility": visibility,
        },
    )
    db.commit()
    return circle_id


class TestCircleSearch:

    def test_search_returns_public_circles(self):
        """Search results include public circles matching the query."""
        token = get_token()
        unique = uuid.uuid4().hex[:8]
        create_circle(token, f"PublicCircle_{unique}", "PUBLIC")

        response = client.get(
            f"/circles/search?q=PublicCircle_{unique}",
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        results = response.json()
        assert any(r["name"] == f"PublicCircle_{unique}" for r in results)

    def test_private_circles_never_appear(self):
        """Private circles do not appear in search results."""
        token = get_token()
        unique = uuid.uuid4().hex[:8]
        create_circle(token, f"PrivateCircle_{unique}", "PRIVATE")

        response = client.get(
            f"/circles/search?q=PrivateCircle_{unique}",
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        results = response.json()
        assert not any(r["name"] == f"PrivateCircle_{unique}" for r in results)

    def test_partial_name_match(self):
        """Partial query matches circle names correctly."""
        token = get_token()
        unique = uuid.uuid4().hex[:8]
        create_circle(token, f"PartialMatch_{unique}", "PUBLIC")

        response = client.get(
            f"/circles/search?q=PartialMatch",
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        results = response.json()
        assert any(f"PartialMatch_{unique}" in r["name"] for r in results)

    def test_empty_query_returns_all_public(self):
        """Empty query returns all public circles."""
        token = get_token()
        response = client.get(
            "/circles/search?q=",
            headers=auth_headers(token),
        )
        assert response.status_code == 200
        results = response.json()
        for r in results:
            assert "circle_id" in r
            assert "name" in r
            assert "member_count" in r

    def test_join_public_circle(self):
        """User can join a public circle successfully."""
        token = get_token()
        unique = uuid.uuid4().hex[:8]
        circle_id = create_circle(token, f"JoinTest_{unique}", "PUBLIC")

        # Use a second user to join
        username = f"joiner_{uuid.uuid4().hex[:8]}"
        reg = client.post("/auth/register", json={
            "email": f"{username}@test.com",
            "password": "testpass123",
            "username": username,
        })
        assert reg.status_code == 201
        other_token = reg.json()["access_token"]

        response = client.post(
            f"/circles/{circle_id}/join",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 201
        assert "joined" in response.json()["message"].lower()

    def test_join_private_circle_rejected(self):
        """Joining a private circle returns 403."""
        token = get_token()
        unique = uuid.uuid4().hex[:8]
        circle_id = create_circle(token, f"PrivateJoin_{unique}", "PRIVATE")

        username = f"joiner2_{uuid.uuid4().hex[:8]}"
        reg = client.post("/auth/register", json={
            "email": f"{username}@test.com",
            "password": "testpass123",
            "username": username,
        })
        other_token = reg.json()["access_token"]

        response = client.post(
            f"/circles/{circle_id}/join",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 403

    def test_is_member_true_after_joining(self):
        """Search result shows is_member=True after joining a circle."""
        token = get_token()
        unique = uuid.uuid4().hex[:8]
        circle_id = create_circle(token, f"MemberCheck_{unique}", "PUBLIC")

        username = f"membercheck_{uuid.uuid4().hex[:8]}"
        reg = client.post("/auth/register", json={
            "email": f"{username}@test.com",
            "password": "testpass123",
            "username": username,
        })
        other_token = reg.json()["access_token"]

        client.post(f"/circles/{circle_id}/join", headers=auth_headers(other_token))

        response = client.get(
            f"/circles/search?q=MemberCheck_{unique}",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 200
        results = response.json()
        match = next((r for r in results if r["circle_id"] == circle_id), None)
        assert match is not None
        assert match["is_member"] is True

    def test_requires_authentication(self):
        """Returns 401 when no token provided."""
        response = client.get("/circles/search?q=test")
        assert response.status_code == 401