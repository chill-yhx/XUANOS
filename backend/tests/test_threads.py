from fastapi.testclient import TestClient


def test_create_list_and_get_thread(client: TestClient) -> None:
    created = client.post("/api/threads", json={"title": "XUANOS 暑假开发"})

    assert created.status_code == 201
    thread = created.json()["data"]
    assert thread["user_id"] == "demo-user"
    assert thread["title"] == "XUANOS 暑假开发"
    assert thread["current_step"] == "idle"

    listed = client.get("/api/threads")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["data"]] == [thread["id"]]

    detail = client.get(f"/api/threads/{thread['id']}")
    assert detail.status_code == 200
    aggregate = detail.json()["data"]
    assert aggregate["thread"]["id"] == thread["id"]
    assert aggregate["current_snapshot"]["user_id"] == "demo-user"
    assert aggregate["plan_versions"] == []


def test_thread_validation_uses_unified_error(client: TestClient) -> None:
    response = client.post("/api/threads", json={"title": ""})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["request_id"].startswith("req_")


def test_missing_thread_uses_unified_error(client: TestClient) -> None:
    response = client.get("/api/threads/does-not-exist")

    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "RESOURCE_NOT_FOUND"
    assert error["details"]["thread_id"] == "does-not-exist"
