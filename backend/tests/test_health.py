from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "xuanos-backend",
        "database": "ok",
        "version": "0.1.0",
    }
    assert response.headers["X-Request-ID"].startswith("req_")
