from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.snapshot import UserSnapshot


def test_initial_user_snapshot(client: TestClient) -> None:
    response = client.get("/api/users/me/snapshot")

    assert response.status_code == 200
    snapshot = response.json()["data"]
    assert snapshot["user_id"] == client.user_id  # type: ignore[attr-defined]
    assert snapshot["version"] == 1
    assert snapshot["current_vector"] == "尚未确认主线"
    assert snapshot["current_stage"] == "等待理解"
    assert snapshot["current_action"] == "创建第一条任务线程"
    assert snapshot["revision_count"] == 0
    assert snapshot["hypotheses"] == []


def test_legacy_seed_snapshot_is_preserved_but_not_used_as_current_context(client: TestClient) -> None:
    initial = client.get("/api/users/me/snapshot").json()["data"]
    with SessionLocal() as session:
        snapshot = session.get(UserSnapshot, initial["id"])
        assert snapshot is not None
        snapshot.reality_boundaries = ["legacy boundary"]
        snapshot.effective_patterns = [{"content": "legacy pattern", "maturity": "candidate"}]
        snapshot.hypotheses = [{"content": "legacy hypothesis", "status": "pending"}]
        snapshot.recent_revisions = ["legacy revision"]
        snapshot.user_corrections = ["legacy correction"]
        session.commit()

    restored = client.get("/api/users/me/snapshot")
    assert restored.status_code == 200
    snapshot = restored.json()["data"]
    assert snapshot["version"] == 2
    assert snapshot["current_vector"] == "尚未确认主线"
    assert snapshot["reality_boundaries"] == []
    assert snapshot["hypotheses"] == []

    with SessionLocal() as session:
        assert session.scalar(select(func.count(UserSnapshot.id))) == 2
