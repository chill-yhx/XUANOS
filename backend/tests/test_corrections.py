import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.hypothesis import Hypothesis
from app.models.snapshot import UserSnapshot
from app.models.understanding import UserCorrection


def idempotency(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


def correction_payload(
    correction_type: str,
    *,
    original_value: str = "完成 XUANOS 静态前端原型",
    corrected_value: str = "完成 XUANOS 前后端联调",
) -> dict[str, str]:
    return {
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
    return confirmed.json()["data"]["snapshot"]["hypotheses"][0]


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
    payload = correction_payload(correction_type)
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
    first_payload = correction_payload("changed")
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
    payload = correction_payload("changed")
    assert client.post("/api/users/me/corrections", headers=headers, json=payload).status_code == 201

    conflict = client.post(
        "/api/users/me/corrections",
        headers=headers,
        json={**payload, "corrected_value": "另一项修正"},
    )

    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "DUPLICATE_SUBMISSION"


def test_correction_rejects_unknown_target(client: TestClient) -> None:
    response = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-missing-target"),
        json={
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

    correction = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-hypothesis-discontinue"),
        json={
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
        assert hypothesis.status == "denied"


def test_partial_hypothesis_creates_persisted_replacement_that_can_be_discontinued(
    client: TestClient,
) -> None:
    hypothesis_data = create_confirmed_hypothesis(client, "correction-hypothesis-replacement")
    corrected_content = "用户在明确首个交付物后更容易进入真实开发。"

    partial = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-hypothesis-replacement-partial"),
        json={
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
        assert original.status == "expired"
        assert replacement is not None
        assert replacement.user_attitude == "accepted"

    discontinued = client.post(
        "/api/users/me/corrections",
        headers=idempotency("correction-hypothesis-replacement-discontinue"),
        json={
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
        assert replacement.status == "denied"


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
        "target_type",
        "target_id",
        "correction_type",
        "original_value",
        "corrected_value",
        "reason",
    }
