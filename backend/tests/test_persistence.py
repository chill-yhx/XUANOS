from fastapi.testclient import TestClient

from app.main import app


def test_thread_survives_new_application_client(client: TestClient) -> None:
    created = client.post("/api/threads", json={"title": "持久化线程"})
    thread_id = created.json()["data"]["id"]

    with TestClient(app) as restarted_client:
        response = restarted_client.get(f"/api/threads/{thread_id}")

    assert response.status_code == 200
    assert response.json()["data"]["thread"]["title"] == "持久化线程"
