"""
Integration coverage for user blocking.

Coverage:
- Block and unblock endpoints update the blocked-users list.
- Anchor list and nearby discovery exclude anchors from blocked creators.
- Unblocking restores anchor visibility.
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Ensure settings parse cleanly in test environments.
os.environ["DEBUG"] = "false"

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def register_user(client: TestClient, prefix: str):
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


def create_anchor(
    client: TestClient,
    token: str,
    title: str,
    lat: float,
    lon: float,
    tags: list[str] | None = None,
):
    response = client.post(
        "/anchors/",
        json={
            "title": title,
            "description": "Anchor created for block-visibility tests.",
            "latitude": lat,
            "longitude": lon,
            "visibility": "PUBLIC",
            "unlock_radius": 75,
            "always_active": True,
            "tags": tags or [],
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    return response.json()


def block_user(client: TestClient, token: str, blocked_user_id: str):
    return client.post(
        "/users/block",
        json={"blocked_user_id": blocked_user_id},
        headers=auth_headers(token),
    )


def unblock_user(client: TestClient, token: str, blocked_user_id: str):
    return client.request(
        "DELETE",
        "/users/block",
        json={"blocked_user_id": blocked_user_id},
        headers=auth_headers(token),
    )


def list_blocked_users(client: TestClient, token: str):
    response = client.get(
        "/users/blocked",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    return response.json()


def nearby_anchor_ids(client: TestClient, token: str, lat: float, lon: float) -> list[str]:
    response = client.get(
        "/anchors/nearby",
        params={"lat": lat, "lon": lon, "radius_km": 10},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    return [anchor["anchor_id"] for anchor in response.json()]


def all_anchor_ids(client: TestClient, token: str) -> list[str]:
    response = client.get(
        "/anchors/",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    return [anchor["anchor_id"] for anchor in response.json()]


def nearby_filter_counts(client: TestClient, token: str, lat: float, lon: float) -> dict[str, list[dict]]:
    response = client.get(
        "/anchors/nearby/filter-options",
        params={"lat": lat, "lon": lon, "radius_km": 10},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    return response.json()


def test_block_and_unblock_endpoints_update_blocked_users_list(client: TestClient):
    viewer = register_user(client, "blockedlistviewer")
    creator = register_user(client, "blockedlistcreator")

    assert list_blocked_users(client, viewer["access_token"]) == []

    block_response = block_user(client, viewer["access_token"], creator["user_id"])

    assert block_response.status_code == 200
    assert block_response.json()["user_id"] == creator["user_id"]
    blocked_users = list_blocked_users(client, viewer["access_token"])
    assert [user["user_id"] for user in blocked_users] == [creator["user_id"]]

    unblock_response = unblock_user(client, viewer["access_token"], creator["user_id"])

    assert unblock_response.status_code == 200
    assert unblock_response.json()["message"] == "User unblocked successfully"
    assert list_blocked_users(client, viewer["access_token"]) == []


def test_blocked_users_anchors_are_hidden_and_unblock_restores_visibility(client: TestClient):
    creator = register_user(client, "blockedcreator")
    viewer = register_user(client, "blockedviewer")
    unique_tag = f"blocked-{uuid.uuid4().hex[:8]}"

    anchor = create_anchor(
        client,
        creator["access_token"],
        title="Blocked Creator Anchor",
        lat=40.4237,
        lon=-86.9212,
        tags=[unique_tag],
    )

    assert anchor["anchor_id"] in nearby_anchor_ids(client, viewer["access_token"], 40.4237, -86.9212)
    assert anchor["anchor_id"] in all_anchor_ids(client, viewer["access_token"])
    initial_filter_counts = nearby_filter_counts(client, viewer["access_token"], 40.4237, -86.9212)
    initial_public_count = next(
        option["count"]
        for option in initial_filter_counts["visibility"]
        if option["value"] == "PUBLIC"
    )
    assert any(option["value"] == unique_tag for option in initial_filter_counts["tags"])

    block_response = block_user(client, viewer["access_token"], creator["user_id"])
    assert block_response.status_code == 200

    assert anchor["anchor_id"] not in nearby_anchor_ids(
        client,
        viewer["access_token"],
        40.4237,
        -86.9212,
    )
    assert anchor["anchor_id"] not in all_anchor_ids(client, viewer["access_token"])
    blocked_filter_counts = nearby_filter_counts(client, viewer["access_token"], 40.4237, -86.9212)
    blocked_public_count = next(
        option["count"]
        for option in blocked_filter_counts["visibility"]
        if option["value"] == "PUBLIC"
    )
    assert blocked_public_count == initial_public_count - 1
    assert all(option["value"] != unique_tag for option in blocked_filter_counts["tags"])

    unblock_response = unblock_user(client, viewer["access_token"], creator["user_id"])
    assert unblock_response.status_code == 200

    assert anchor["anchor_id"] in nearby_anchor_ids(
        client,
        viewer["access_token"],
        40.4237,
        -86.9212,
    )
    assert anchor["anchor_id"] in all_anchor_ids(client, viewer["access_token"])
    restored_filter_counts = nearby_filter_counts(client, viewer["access_token"], 40.4237, -86.9212)
    restored_public_count = next(
        option["count"]
        for option in restored_filter_counts["visibility"]
        if option["value"] == "PUBLIC"
    )
    assert restored_public_count == initial_public_count
    assert any(option["value"] == unique_tag for option in restored_filter_counts["tags"])
