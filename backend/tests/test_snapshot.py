from fastapi.testclient import TestClient


def test_initial_demo_snapshot(client: TestClient) -> None:
    response = client.get("/api/users/demo-user/snapshot")

    assert response.status_code == 200
    snapshot = response.json()["data"]
    assert snapshot["user_id"] == "demo-user"
    assert snapshot["version"] == 1
    assert snapshot["current_vector"] == "完成 XUANOS 静态前端原型"
    assert snapshot["revision_count"] == 0
    assert snapshot["hypotheses"][0]["status"] == "pending"
