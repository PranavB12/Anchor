"""
US9 #4 — Unit tests for anchor voting

Tests:
    - User can upvote an anchor
    - User can downvote an anchor
    - Voting same value twice removes the vote
    - Changing from upvote to downvote switches correctly
    - Net score is calculated accurately
    - Creator cannot vote on their own anchor
    - Requires authentication
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db
from sqlalchemy import text
from datetime import datetime, timedelta

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


def create_anchor_for_voting(token: str) -> str:
    """Create an anchor and backdate activation_time so it can be voted on."""
    payload = {
        "title": f"Vote Test Anchor {uuid.uuid4().hex[:6]}",
        "description": "Test",
        "latitude": 40.4237,
        "longitude": -86.9212,
        "altitude": None,
        "visibility": "PUBLIC",
        "unlock_radius": 50,
        "max_unlock": None,
        "always_active": True,
        "tags": [],
    }
    response = client.post("/anchors/", json=payload, headers=auth_headers(token))
    assert response.status_code == 201
    anchor_id = response.json()["anchor_id"]

    db = next(get_db())
    db.execute(
        text("UPDATE anchors SET activation_time = :t WHERE anchor_id = :id"),
        {"t": datetime.utcnow() - timedelta(minutes=5), "id": anchor_id},
    )
    db.commit()

    return anchor_id


def create_voter() -> tuple[str, str]:
    """Register a second user and return (user_id, token)."""
    username = f"voter_{uuid.uuid4().hex[:8]}"
    response = client.post("/auth/register", json={
        "email": f"{username}@test.com",
        "password": "testpass123",
        "username": username,
    })
    assert response.status_code == 201
    data = response.json()
    return data["user_id"], data["access_token"]


class TestAnchorVotes:

    def test_upvote_anchor(self):
        """User can upvote an anchor successfully."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)
        _, voter_token = create_voter()

        response = client.post(
            f"/anchors/{anchor_id}/vote",
            json={"vote": "UPVOTE"},
            headers=auth_headers(voter_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["net_votes"] == 1
        assert data["user_vote"] == "UPVOTE"

    def test_downvote_anchor(self):
        """User can downvote an anchor successfully."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)
        _, voter_token = create_voter()

        response = client.post(
            f"/anchors/{anchor_id}/vote",
            json={"vote": "DOWNVOTE"},
            headers=auth_headers(voter_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["net_votes"] == -1
        assert data["user_vote"] == "DOWNVOTE"

    def test_same_vote_twice_removes_vote(self):
        """Voting with the same value twice removes the vote."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)
        _, voter_token = create_voter()

        client.post(f"/anchors/{anchor_id}/vote", json={"vote": "UPVOTE"}, headers=auth_headers(voter_token))
        response = client.post(f"/anchors/{anchor_id}/vote", json={"vote": "UPVOTE"}, headers=auth_headers(voter_token))

        assert response.status_code == 200
        data = response.json()
        assert data["net_votes"] == 0
        assert data["user_vote"] is None

    def test_switch_vote_from_upvote_to_downvote(self):
        """Changing vote from upvote to downvote updates correctly."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)
        _, voter_token = create_voter()

        client.post(f"/anchors/{anchor_id}/vote", json={"vote": "UPVOTE"}, headers=auth_headers(voter_token))
        response = client.post(f"/anchors/{anchor_id}/vote", json={"vote": "DOWNVOTE"}, headers=auth_headers(voter_token))

        assert response.status_code == 200
        data = response.json()
        assert data["net_votes"] == -1
        assert data["user_vote"] == "DOWNVOTE"

    def test_net_score_with_multiple_voters(self):
        """Net score reflects all votes from multiple users accurately."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)

        _, voter1_token = create_voter()
        _, voter2_token = create_voter()
        _, voter3_token = create_voter()

        client.post(f"/anchors/{anchor_id}/vote", json={"vote": "UPVOTE"}, headers=auth_headers(voter1_token))
        client.post(f"/anchors/{anchor_id}/vote", json={"vote": "UPVOTE"}, headers=auth_headers(voter2_token))
        response = client.post(f"/anchors/{anchor_id}/vote", json={"vote": "DOWNVOTE"}, headers=auth_headers(voter3_token))

        assert response.status_code == 200
        assert response.json()["net_votes"] == 1

    def test_creator_cannot_vote_own_anchor(self):
        """Anchor creator cannot vote on their own anchor — returns 403."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)

        response = client.post(
            f"/anchors/{anchor_id}/vote",
            json={"vote": "UPVOTE"},
            headers=auth_headers(token),
        )
        assert response.status_code == 403

    def test_invalid_vote_value_returns_400(self):
        """Invalid vote value returns 400."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)
        _, voter_token = create_voter()

        response = client.post(
            f"/anchors/{anchor_id}/vote",
            json={"vote": "SIDEWAYSVOTE"},
            headers=auth_headers(voter_token),
        )
        assert response.status_code == 400

    def test_requires_authentication(self):
        """Returns 401 when no token provided."""
        token = get_token()
        anchor_id = create_anchor_for_voting(token)

        response = client.post(
            f"/anchors/{anchor_id}/vote",
            json={"vote": "UPVOTE"},
        )
        assert response.status_code == 401