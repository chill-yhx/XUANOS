from fastapi.testclient import TestClient


def test_demo_reset_removes_threads_and_recreates_snapshot(client: TestClient) -> None:
    assert (
        client.post(
            "/api/threads",
            headers={"Idempotency-Key": "reset-thread-create"},
            json={"title": "即将重置"},
        ).status_code
        == 201
    )

    response = client.post("/api/demo/reset", json={"confirm": True})

    assert response.status_code == 200
    result = response.json()["data"]
    assert result["user_id"] == client.user_id  # type: ignore[attr-defined]
    assert result["current_step"] == "idle"
    assert result["snapshot"]["version"] == 1
    assert client.get("/api/threads").json()["data"] == []


def test_demo_reset_requires_explicit_confirmation(client: TestClient) -> None:
    response = client.post("/api/demo/reset", json={"confirm": False})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
