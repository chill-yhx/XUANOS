from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from auth_helpers import cookie_headers
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.main import app
from app.models.hypothesis import Hypothesis
from app.models.idempotency import IdempotencyRecord
from app.models.snapshot import UserSnapshot
from app.models.understanding import UserCorrection


def idempotency(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


def correction_payload(
    correction_type: str,
    expected_snapshot_id: str,
    *,
    original_value: str = "完成 XUANOS 静态前端原型",
    corrected_value: str = "完成 XUANOS 前后端联调",
) -> dict[str, str]:
    return {
        "expected_snapshot_id": expected_snapshot_id,
        "target_type": "system_section",
        "target_id": "vector",
        "correction_type": correction_type,
        "original_value": original_value,
        "corrected_value": corrected_value,
        "reason": "当前项目阶段已经变化。",
    }


def create_confirmed_hypothesis(client: TestClient, key_prefix: str) -> dict:
    thread = client.post(
        "/api/threads",
        headers=idempotency(f"{key_prefix}-thread"),
        json={"title": "假设纠正测试"},
    ).json()["data"]
    started = client.post(
        "/api/understanding/analyze",
        headers=idempotency(f"{key_prefix}-start"),
        json={"thread_id": thread["id"], "expression_mode": "ask"},
    ).json()["data"]
    session_id = started["session"]["id"]
    answers = [
        ("desired_result", "验证用户能够停止系统继续使用某项假设。"),
        ("current_foundation", "后端已有理解与快照能力。"),
        ("real_constraints", "本轮只验证后端契约。"),
    ]
    for index, (question_id, answer_text) in enumerate(answers):
        response = client.post(
            "/api/understanding/analyze",
            headers=idempotency(f"{key_prefix}-answer-{index}"),
            json={
                "thread_id": thread["id"],
                "session_id": session_id,
                "answer": {"question_id": question_id, "answer_text": answer_text},
            },
        )
        assert response.status_code == 200
    confirmed = client.post(
        f"/api/understanding/{session_id}/confirm",
        headers=idempotency(f"{key_prefix}-confirm"),
        json={"assessment": "accurate"},
    )
    assert confirmed.status_code == 200
    hypothesis = confirmed.json()["data"]["snapshot"]["hypotheses"][0]
    return {**hypothesis, "_thread_id": thread["id"], "_session_id": session_id}


def create_and_accept_plan(client: TestClient, hypothesis_data: dict, key_prefix: str) -> dict:
    created = client.post(
        "/api/plans",
        headers=idempotency(f"{key_prefix}-plan"),
        json={
            "thread_id": hypothesis_data["_thread_id"],
            "understanding_session_id": hypothesis_data["_session_id"],
        },
    )
    assert created.status_code == 201
    plan = created.json()["data"]["plan"]
    accepted = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=idempotency(f"{key_prefix}-accept"),
        json={"expected_version": plan["version"]},
    )
    assert accepted.status_code == 200
    return accepted.json()["data"]["plan"]


@pytest.mark.parametrize(
    ("correction_type", "snapshot_updated"),
    [
        ("accurate", False),
        ("partial", True),
        ("inaccurate", True),
        ("changed", True),
        ("discontinue", True),
    ],
)
def test_supported_correction_types(
    client: TestClient,
    correction_type: str,
    snapshot_updated: bool,
) -> None:
    before = client.get("/api/users/me/snapshot").json()["data"]
    payload = correction_payload(correction_type, before["id"])
    if correction_type == "accurate":
        payload["corrected_value"] = payload["original_value"]

    response = client.post(
        "/api/users/me/corrections",
        headers=idempotency(f"correction-type-{correction_type}"),
        json=payload,
    )

    assert response.status_code == 201
    result = response.json()["data"]
    assert result["correction"]["correction_type"] == correction_type
    assert result["snapshot_updated"] is snapshot_updated
    expected_version = before["version"] + (1 if snapshot_updated else 0)
    assert result["snapshot"]["version"] == expected_version


def test_correction_is_append_only_and_idempotent(client: TestClient) -> None:
    initial_snapshot = client.get("/api/users/me/snapshot").json()["data"]
    first_payload = correction_payload("changed", initial_snapshot["id"])
    first_headers = idempotency("correction-vector-changed")

    first = client.post(
        "/api/users/me/corrections",
        headers=first_headers,
        json=first_payload,
    )
    replay = client.post(
        "/api/users/me/corrections",
        headers=first_headers,
        json=first_payload,
    )

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json()["data"] == first.json()["data"]
    first_result = first.json()["data"]
    assert first_result["snapshot"]["current_vector"] == "完成 XUANOS 前后端联调"

    second_payload = correction_payload(
        "partial",
        first_result["snapshot"]["id"],
        original_value="完成 XUANOS 前后端联调",
        corrected_value="先完成后端契约，再开始前端联调",
    )
    second = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-vector-partial"),
        json=second_payload,
    )

    assert second.status_code == 201
    second_result = second.json()["data"]
    assert second_result["correction"]["id"] != first_result["correction"]["id"]
    assert second_result["snapshot"]["version"] == first_result["snapshot"]["version"] + 1
    assert second_result["snapshot"]["current_vector"] == "先完成后端契约，再开始前端联调"
    assert second_result["snapshot"]["user_corrections"][0].endswith("先完成后端契约，再开始前端联调")

    latest = client.get("/api/users/me/snapshot")
    assert latest.status_code == 200
    assert latest.json()["data"]["id"] == second_result["snapshot"]["id"]

    with SessionLocal() as session:
        corrections = list(session.scalars(select(UserCorrection).order_by(UserCorrection.created_at)))
        assert len(corrections) == 2
        assert corrections[0].previous_value == first_payload["original_value"]
        assert corrections[0].user_value == first_payload["corrected_value"]
        assert session.scalar(select(func.count(UserSnapshot.id))) == second_result["snapshot"]["version"]


def test_correction_idempotency_key_rejects_different_payload(client: TestClient) -> None:
    headers = idempotency("correction-conflicting-payload")
    current_snapshot = client.get("/api/users/me/snapshot").json()["data"]
    payload = correction_payload("changed", current_snapshot["id"])
    assert client.post("/api/users/me/corrections", headers=headers, json=payload).status_code == 201

    conflict = client.post(
        "/api/users/me/corrections",
        headers=headers,
        json={**payload, "corrected_value": "另一项修正"},
    )

    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "DUPLICATE_SUBMISSION"


def test_stale_snapshot_correction_is_rejected_without_partial_writes(client: TestClient) -> None:
    snapshot_v1 = client.get("/api/users/me/snapshot").json()["data"]
    first_payload = correction_payload("changed", snapshot_v1["id"])
    second_payload = {
        **correction_payload("partial", snapshot_v1["id"]),
        "corrected_value": "基于过期快照的第二次修正",
    }

    barrier = Barrier(2)
    auth_headers = cookie_headers(client)

    def submit(payload: dict[str, str], key: str):
        with TestClient(app) as concurrent_client:
            barrier.wait(timeout=5)
            return concurrent_client.post(
                "/api/users/me/corrections",
                headers={
                    **auth_headers,
                    "Idempotency-Key": key,
                },
                json=payload,
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda args: submit(*args),
                [
                    (first_payload, "correction-concurrency-first"),
                    (second_payload, "correction-concurrency-second"),
                ],
            )
        )

    assert sorted(response.status_code for response in responses) == [201, 409]
    succeeded = next(response for response in responses if response.status_code == 201)
    stale = next(response for response in responses if response.status_code == 409)
    snapshot_v2 = succeeded.json()["data"]["snapshot"]
    assert snapshot_v2["version"] == snapshot_v1["version"] + 1
    error = stale.json()["error"]
    assert error["code"] == "STALE_SNAPSHOT"
    assert error["details"]["expected_snapshot_id"] == snapshot_v1["id"]
    assert error["details"]["current_snapshot_id"] == snapshot_v2["id"]

    with SessionLocal() as session:
        assert session.scalar(select(func.count(UserCorrection.id))) == 1
        assert session.scalar(select(func.count(UserSnapshot.id))) == 2
        assert session.scalar(select(func.count(IdempotencyRecord.id))) == 1


def test_correction_rejects_unknown_target(client: TestClient) -> None:
    current_snapshot = client.get("/api/users/me/snapshot").json()["data"]
    response = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-missing-target"),
        json={
            "expected_snapshot_id": current_snapshot["id"],
            "target_type": "plan",
            "target_id": "missing-plan",
            "correction_type": "inaccurate",
            "original_value": "旧计划",
            "corrected_value": "新计划",
            "reason": "该计划不存在。",
        },
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_discontinued_hypothesis_is_removed_from_snapshot(client: TestClient) -> None:
    hypothesis_data = create_confirmed_hypothesis(client, "correction-hypothesis")
    plan = create_and_accept_plan(client, hypothesis_data, "correction-hypothesis")
    current_snapshot = client.get("/api/users/me/snapshot").json()["data"]

    correction = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-hypothesis-discontinue"),
        json={
            "expected_snapshot_id": current_snapshot["id"],
            "target_type": "hypothesis",
            "target_id": hypothesis_data["id"],
            "correction_type": "discontinue",
            "original_value": hypothesis_data["content"],
            "corrected_value": "不再使用该判断",
            "reason": "用户明确要求停止使用。",
        },
    )

    assert correction.status_code == 201
    result = correction.json()["data"]
    assert all(item.get("id") != hypothesis_data["id"] for item in result["snapshot"]["hypotheses"])
    with SessionLocal() as session:
        hypothesis = session.get(Hypothesis, hypothesis_data["id"])
        assert hypothesis is not None
        assert hypothesis.user_attitude == "rejected"
        assert hypothesis.status == "discontinued"
        semantic_key = hypothesis.semantic_key

    feedback = client.post(
        "/api/action-results",
        headers=idempotency("correction-hypothesis-feedback-after-discontinue"),
        json={
            "thread_id": hypothesis_data["_thread_id"],
            "plan_id": plan["id"],
            "started": False,
            "completed": False,
            "progress_percent": 0,
            "obstacle_code": "other",
        },
    )

    assert feedback.status_code == 201
    feedback_data = feedback.json()["data"]
    assert feedback_data["hypothesis"]["id"] == hypothesis_data["id"]
    assert feedback_data["hypothesis"]["status"] == "discontinued"
    assert all(item.get("id") != hypothesis_data["id"] for item in feedback_data["snapshot"]["hypotheses"])
    with SessionLocal() as session:
        hypothesis = session.get(Hypothesis, hypothesis_data["id"])
        assert hypothesis is not None
        assert hypothesis.status == "discontinued"
        assert session.scalar(select(func.count(Hypothesis.id)).where(Hypothesis.semantic_key == semantic_key)) == 1


def test_partial_hypothesis_creates_persisted_replacement_that_can_be_discontinued(
    client: TestClient,
) -> None:
    hypothesis_data = create_confirmed_hypothesis(client, "correction-hypothesis-replacement")
    plan = create_and_accept_plan(client, hypothesis_data, "correction-hypothesis-replacement")
    current_snapshot = client.get("/api/users/me/snapshot").json()["data"]
    corrected_content = "用户在明确首个交付物后更容易进入真实开发。"

    partial = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-hypothesis-replacement-partial"),
        json={
            "expected_snapshot_id": current_snapshot["id"],
            "target_type": "hypothesis",
            "target_id": hypothesis_data["id"],
            "correction_type": "partial",
            "original_value": hypothesis_data["content"],
            "corrected_value": corrected_content,
            "reason": "原判断只有部分准确。",
        },
    )

    assert partial.status_code == 201
    replacement_data = partial.json()["data"]["snapshot"]["hypotheses"][0]
    assert replacement_data["id"] != hypothesis_data["id"]
    assert replacement_data["content"] == corrected_content
    assert len(replacement_data["id"]) <= 36
    with SessionLocal() as session:
        original = session.get(Hypothesis, hypothesis_data["id"])
        replacement = session.get(Hypothesis, replacement_data["id"])
        assert original is not None
        assert original.status == "superseded"
        assert original.superseded_by_id == replacement_data["id"]
        assert replacement is not None
        assert replacement.user_attitude == "accepted"

    feedback = client.post(
        "/api/action-results",
        headers=idempotency("correction-hypothesis-replacement-feedback"),
        json={
            "thread_id": hypothesis_data["_thread_id"],
            "plan_id": plan["id"],
            "started": True,
            "completed": False,
            "progress_percent": 70,
            "obstacle_code": "lack_of_time",
        },
    )
    assert feedback.status_code == 201
    feedback_data = feedback.json()["data"]
    assert feedback_data["hypothesis"]["id"] == replacement_data["id"]
    with SessionLocal() as session:
        original = session.get(Hypothesis, hypothesis_data["id"])
        assert original is not None
        assert original.status == "superseded"
        assert (
            session.scalar(
                select(func.count(Hypothesis.id)).where(
                    Hypothesis.thread_id == hypothesis_data["_thread_id"],
                    Hypothesis.category == "goal_feasibility",
                )
            )
            == 2
        )

    discontinued = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-hypothesis-replacement-discontinue"),
        json={
            "expected_snapshot_id": feedback_data["snapshot"]["id"],
            "target_type": "hypothesis",
            "target_id": replacement_data["id"],
            "correction_type": "discontinue",
            "original_value": corrected_content,
            "corrected_value": corrected_content,
            "reason": "用户要求停止使用修正后的判断。",
        },
    )

    assert discontinued.status_code == 201
    result = discontinued.json()["data"]
    assert all(item.get("id") != replacement_data["id"] for item in result["snapshot"]["hypotheses"])
    with SessionLocal() as session:
        replacement = session.get(Hypothesis, replacement_data["id"])
        assert replacement is not None
        assert replacement.user_attitude == "rejected"
        assert replacement.status == "discontinued"


def test_inaccurate_hypothesis_creates_a_distinct_active_replacement(client: TestClient) -> None:
    hypothesis_data = create_confirmed_hypothesis(client, "correction-hypothesis-inaccurate")
    current_snapshot = client.get("/api/users/me/snapshot").json()["data"]
    corrected_content = "用户会在目标边界不清晰时推迟开始"

    response = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-hypothesis-inaccurate-replacement"),
        json={
            "expected_snapshot_id": current_snapshot["id"],
            "target_type": "hypothesis",
            "target_id": hypothesis_data["id"],
            "correction_type": "inaccurate",
            "original_value": hypothesis_data["content"],
            "corrected_value": corrected_content,
            "reason": "原判断不准确，但存在另一条更具体的待验证判断。",
        },
    )

    assert response.status_code == 201
    replacement_data = response.json()["data"]["snapshot"]["hypotheses"][0]
    assert replacement_data["id"] != hypothesis_data["id"]
    assert replacement_data["content"] == corrected_content
    with SessionLocal() as session:
        original = session.get(Hypothesis, hypothesis_data["id"])
        replacement = session.get(Hypothesis, replacement_data["id"])
        assert original is not None
        assert original.status == "denied"
        assert original.superseded_by_id == replacement_data["id"]
        assert replacement is not None
        assert replacement.status == "pending"
        assert replacement.semantic_key != original.semantic_key


def test_openapi_exposes_thread_and_correction_idempotency(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    thread_post = schema["paths"]["/api/threads"]["post"]
    correction_post = schema["paths"]["/api/users/me/corrections"]["post"]

    assert any(
        parameter["name"] == "Idempotency-Key" and parameter["required"] for parameter in thread_post["parameters"]
    )
    assert any(
        parameter["name"] == "Idempotency-Key" and parameter["required"] for parameter in correction_post["parameters"]
    )
    correction_schema = schema["components"]["schemas"]["UserCorrectionCreate"]
    assert set(correction_schema["required"]) == {
        "expected_snapshot_id",
        "target_type",
        "target_id",
        "correction_type",
        "original_value",
        "corrected_value",
        "reason",
    }
