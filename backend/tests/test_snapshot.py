from fastapi.testclient import TestClient


def test_initial_user_snapshot(client: TestClient) -> None:
    response = client.get("/api/users/me/snapshot")

    assert response.status_code == 200
    snapshot = response.json()["data"]
    assert snapshot["user_id"] == client.user_id  # type: ignore[attr-defined]
    assert snapshot["version"] == 1
    assert snapshot["current_vector"] == "完成 XUANOS 静态前端原型"
    assert snapshot["revision_count"] == 0
    assert snapshot["hypotheses"][0]["status"] == "pending"
