from typing import Any

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import app


def issue_identity(client: TestClient) -> tuple[str, dict[str, str]]:
    response = client.post("/api/sessions")
    assert response.status_code == 201
    data = response.json()["data"]
    return data["user_id"], {"Authorization": f"Bearer {data['access_token']}"}


def write_headers(auth: dict[str, str], key: str) -> dict[str, str]:
    return {**auth, "Idempotency-Key": key}


def create_accepted_plan(client: TestClient, auth: dict[str, str], prefix: str) -> dict[str, Any]:
    thread = client.post(
        "/api/threads",
        headers=write_headers(auth, f"{prefix}-thread"),
        json={"title": "身份隔离测试"},
    ).json()["data"]
    started = client.post(
        "/api/understanding/analyze",
        headers=write_headers(auth, f"{prefix}-understanding"),
        json={"thread_id": thread["id"], "expression_mode": "ask"},
    ).json()["data"]
    session_id = started["session"]["id"]
    answers = [
        ("desired_result", "验证不同种子用户的数据完全隔离。"),
        ("current_foundation", "已有服务端身份会话和核心流程。"),
        ("real_constraints", "本轮只验证最小身份隔离。"),
    ]
    for index, (question_id, answer_text) in enumerate(answers):
        response = client.post(
            "/api/understanding/analyze",
            headers=write_headers(auth, f"{prefix}-answer-{index}"),
            json={
                "thread_id": thread["id"],
                "session_id": session_id,
                "answer": {"question_id": question_id, "answer_text": answer_text},
            },
        )
        assert response.status_code == 200
    confirmed = client.post(
        f"/api/understanding/{session_id}/confirm",
        headers=write_headers(auth, f"{prefix}-confirm"),
        json={"assessment": "accurate"},
    )
    assert confirmed.status_code == 200
    hypothesis = confirmed.json()["data"]["snapshot"]["hypotheses"][0]
    plan = client.post(
        "/api/plans",
        headers=write_headers(auth, f"{prefix}-plan"),
        json={"thread_id": thread["id"], "understanding_session_id": session_id},
    ).json()["data"]["plan"]
    accepted = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=write_headers(auth, f"{prefix}-accept"),
        json={"expected_version": plan["version"]},
    )
    assert accepted.status_code == 200
    return {"thread": thread, "plan": plan, "hypothesis": hypothesis}


def test_missing_and_invalid_identity_are_rejected() -> None:
    with TestClient(app) as unauthenticated:
        missing = unauthenticated.get("/api/threads")
        invalid = unauthenticated.get(
            "/api/threads",
            headers={"Authorization": "Bearer invalid-session-token"},
        )
        reset = unauthenticated.post("/api/demo/reset", json={"confirm": True})

    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "AUTH_REQUIRED"
    assert invalid.status_code == 401
    assert invalid.json()["error"]["code"] == "AUTH_INVALID"
    assert reset.status_code == 401
    assert reset.json()["error"]["code"] == "AUTH_REQUIRED"


def test_users_cannot_read_or_mutate_each_others_workflow(client: TestClient) -> None:
    user_a = client.user_id  # type: ignore[attr-defined]
    auth_a = {"Authorization": client.headers["Authorization"]}
    user_b, auth_b = issue_identity(client)
    resources = create_accepted_plan(client, auth_a, "identity-a")
    thread = resources["thread"]
    plan = resources["plan"]
    hypothesis = resources["hypothesis"]

    snapshot_a = client.get("/api/users/me/snapshot", headers=auth_a).json()["data"]
    snapshot_b = client.get("/api/users/me/snapshot", headers=auth_b).json()["data"]
    assert snapshot_a["user_id"] == user_a
    assert snapshot_b["user_id"] == user_b
    assert snapshot_a["id"] != snapshot_b["id"]
    assert client.get(f"/api/threads/{thread['id']}", headers=auth_b).status_code == 404

    revised = client.post(
        f"/api/plans/{plan['id']}/revise",
        headers=write_headers(auth_b, "identity-b-revise-a-plan"),
        json={
            "reason": "time_conflict",
            "user_final_choice": "越权修改",
            "expected_impact_acknowledged": True,
            "expected_version": plan["version"],
        },
    )
    accepted = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=write_headers(auth_b, "identity-b-accept-a-plan"),
        json={"expected_version": plan["version"]},
    )
    feedback = client.post(
        "/api/action-results",
        headers=write_headers(auth_b, "identity-b-feedback-a-plan"),
        json={
            "thread_id": thread["id"],
            "plan_id": plan["id"],
            "started": False,
            "completed": False,
            "progress_percent": 0,
            "obstacle_code": "other",
        },
    )
    snapshot_b = client.get("/api/users/me/snapshot", headers=auth_b).json()["data"]
    correction = client.post(
        "/api/users/me/corrections",
        headers=write_headers(auth_b, "identity-b-correct-a-hypothesis"),
        json={
            "expected_snapshot_id": snapshot_b["id"],
            "target_type": "hypothesis",
            "target_id": hypothesis["id"],
            "correction_type": "inaccurate",
            "original_value": hypothesis["content"],
            "corrected_value": "越权纠正",
            "reason": "该资源属于用户 A。",
        },
    )

    assert revised.status_code == 404
    assert accepted.status_code == 404
    assert feedback.status_code == 404
    assert correction.status_code == 404


def test_reset_is_disabled_outside_development(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_env="production",
        demo_reset_enabled=True,
    )
    try:
        response = client.post("/api/demo/reset", json={"confirm": True})
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_development_reset_only_clears_current_user(client: TestClient) -> None:
    user_a = client.user_id  # type: ignore[attr-defined]
    auth_a = {"Authorization": client.headers["Authorization"]}
    user_b, auth_b = issue_identity(client)
    thread_a = client.post(
        "/api/threads",
        headers=write_headers(auth_a, "reset-a-thread"),
        json={"title": "用户 A"},
    ).json()["data"]
    thread_b = client.post(
        "/api/threads",
        headers=write_headers(auth_b, "reset-b-thread"),
        json={"title": "用户 B"},
    ).json()["data"]

    reset = client.post("/api/demo/reset", headers=auth_a, json={"confirm": True})

    assert reset.status_code == 200
    assert reset.json()["data"]["user_id"] == user_a
    assert client.get("/api/threads", headers=auth_a).json()["data"] == []
    remaining_b = client.get("/api/threads", headers=auth_b).json()["data"]
    assert [item["id"] for item in remaining_b] == [thread_b["id"]]
    assert client.get(f"/api/threads/{thread_a['id']}", headers=auth_b).status_code == 404
    assert client.get("/api/users/me/snapshot", headers=auth_b).json()["data"]["user_id"] == user_b
