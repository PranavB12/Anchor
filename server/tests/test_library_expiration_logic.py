from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.api.library import _compute_expiration_status
from app.core.database import SessionLocal
from app.main import app
from app.schemas.library import SavedAnchorExpirationStatus

client = TestClient(app)

_token_cache = None


def get_token():
    global _token_cache
    if _token_cache:
        return _token_cache
    resp = client.post("/auth/register", json={
        "email": "testlibraryexpiration@example.com",
        "password": "testpass123",
        "username": "testlibraryexpiration",
    })
    if resp.status_code == 201:
        _token_cache = resp.json()["access_token"]
    else:
        resp = client.post("/auth/login", json={
            "email": "testlibraryexpiration@example.com",
            "password": "testpass123",
        })
        assert resp.status_code == 200
        _token_cache = resp.json()["access_token"]
    return _token_cache


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_anchor(token: str, **overrides) -> dict:
    payload = {
        "title": "Library Expiration Test Anchor",
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
    resp = client.get("/user/library", headers=auth_headers(token))
    assert resp.status_code == 200
    for saved in resp.json():
        client.delete(
            f"/user/library/{saved['anchor_id']}",
            headers=auth_headers(token),
        )


def set_anchor_expiration(anchor_id: str, expiration_time: datetime, status: str = "ACTIVE"):
    db = SessionLocal()
    try:
        db.execute(
            text("""
                UPDATE anchors
                SET expiration_time = :expiration_time,
                    status = :status
                WHERE anchor_id = :anchor_id
            """),
            {
                "anchor_id": anchor_id,
                "expiration_time": expiration_time,
                "status": status,
            },
        )
        db.commit()
    finally:
        db.close()


class TestSavedAnchorExpirationStatusLogic:

    def test_boundary_time_counts_as_expired(self):
        now = datetime(2026, 4, 23, 12, 0, 0)
        assert _compute_expiration_status("ACTIVE", now, now=now) == "EXPIRED"

    def test_future_expiration_stays_live(self):
        now = datetime(2026, 4, 23, 12, 0, 0)
        future = now + timedelta(seconds=1)
        assert _compute_expiration_status("ACTIVE", future, now=now) == "LIVE"

    def test_always_active_anchor_stays_live(self):
        now = datetime(2026, 4, 23, 12, 0, 0)
        assert _compute_expiration_status("ACTIVE", None, now=now) == "LIVE"

    def test_expired_anchor_status_wins_without_end_time(self):
        now = datetime(2026, 4, 23, 12, 0, 0)
        assert _compute_expiration_status("EXPIRED", None, now=now) == "EXPIRED"


class TestLibraryExpirationFiltering:

    def test_library_filter_returns_only_requested_expiration_group(self):
        token = get_token()
        clear_library(token)

        live_anchor = create_anchor(token, title="Live Saved Anchor")
        expired_anchor = create_anchor(token, title="Expired Saved Anchor")
        set_anchor_expiration(
            expired_anchor["anchor_id"],
            datetime.utcnow() - timedelta(minutes=5),
        )

        live_save = client.post(
            "/user/library/save",
            json={"anchor_id": live_anchor["anchor_id"]},
            headers=auth_headers(token),
        )
        expired_save = client.post(
            "/user/library/save",
            json={"anchor_id": expired_anchor["anchor_id"]},
            headers=auth_headers(token),
        )
        assert live_save.status_code == 201
        assert expired_save.status_code == 201
        assert live_save.json()["expiration_status"] == SavedAnchorExpirationStatus.LIVE
        assert expired_save.json()["expiration_status"] == SavedAnchorExpirationStatus.EXPIRED

        live_resp = client.get(
            "/user/library?expiration_status=LIVE",
            headers=auth_headers(token),
        )
        expired_resp = client.get(
            "/user/library?expiration_status=EXPIRED",
            headers=auth_headers(token),
        )
        assert live_resp.status_code == 200
        assert expired_resp.status_code == 200
        assert [item["anchor_id"] for item in live_resp.json()] == [live_anchor["anchor_id"]]
        assert [item["anchor_id"] for item in expired_resp.json()] == [expired_anchor["anchor_id"]]

    def test_invalid_expiration_filter_is_rejected(self):
        token = get_token()
        resp = client.get(
            "/user/library?expiration_status=STALE",
            headers=auth_headers(token),
        )
        assert resp.status_code == 400
