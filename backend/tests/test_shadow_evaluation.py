import json
from collections.abc import Callable
from typing import Any

import pytest
from auth_helpers import invite_and_login
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.core.config import Settings, get_settings
from app.db.session import SessionLocal
from app.engines.errors import ShadowProviderTimeoutError
from app.engines.schemas import candidate_schema_for
from app.main import app
from app.models.action_result import ActionResult
from app.models.plan import Plan
from app.models.shadow_evaluation import ShadowEvaluation
from app.models.snapshot import UserSnapshot
from app.services import shadow_evaluation_service


def idempotency(value: str) -> dict[str, str]:
    return {"Idempotency-Key": f"shadow-{value}"}


class ContextEchoProvider:
    provider_name = "test_provider"
    model_name = "shadow-test-model"

    def __init__(self, override: Callable[[str, dict[str, Any]], str] | None = None) -> None:
        self.prompts: list[dict[str, Any]] = []
        self.override = override

    def generate(self, prompt) -> str:
        payload = json.loads(prompt.messages[-1]["content"])
        self.prompts.append(payload)
        if self.override is not None:
            return self.override(prompt.version, payload)
        context = payload["context"]
        answers = {item["question_id"]: item["answer_text"] for item in context["answers"]}
        goal = (
            (context["confirmed_understanding"] or {}).get("real_goal")
            or context.get("original_expression")
            or "当前目标"
        )
        constraints = (
            (context["confirmed_understanding"] or {}).get("constraints")
            or answers.get("real_constraints")
            or "现实限制待确认"
        )
        if prompt.version == "understanding_v1":
            return json.dumps(
                {
                    "real_goal": goal,
                    "foundation": answers.get("current_foundation", "当前基础待确认"),
                    "constraints": constraints,
                    "tension": f"需要在{constraints}内推进{goal}。",
                    "uncertain": "首轮行动的实际阻力仍待验证。",
                    "unknown_information": [],
                },
                ensure_ascii=False,
            )
        if prompt.version == "plan_v1":
            return json.dumps(
                {
                    "stage": "首轮验证",
                    "summary": f"围绕{goal}安排一项受现实限制约束的首轮行动。",
                    "single_action": f"用 30 分钟完成与{goal}直接相关的第一个可检查单元。",
                    "completion_standard": "留下一个可检查结果，并记录实际用时和阻力。",
                    "review_condition": "完成后或两次未开始后复查范围。",
                    "workload": "low",
                    "system_recommendation": "先验证最小行动，再决定是否扩展。",
                    "items": [
                        {
                            "item_type": "action",
                            "title": f"推进{goal}的第一个可检查单元。",
                            "sort_order": 1,
                            "estimated_minutes": 30,
                            "completion_standard": "留下一个可检查结果。",
                        }
                    ],
                    "maintenance_goals": [],
                    "paused_goals": [],
                    "deleted_items": [],
                    "unknown_information": [],
                },
                ensure_ascii=False,
            )
        feedback = context["action_feedback"]
        return json.dumps(
            {
                "actual_result": f"已记录{feedback['progress_percent']}% 的行动结果。",
                "revised_judgment": f"需要根据{feedback['obstacle_code']}继续调整范围。",
                "next_adjustment": f"为{goal}安排一次更小、更明确的下一步行动。",
                "next_stage": "行动复查",
                "pattern": "首轮反馈只形成待验证的行动规律。",
                "hypothesis_status": "pending",
                "unknown_information": [],
            },
            ensure_ascii=False,
        )


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def enable_shadow(
    monkeypatch: pytest.MonkeyPatch, provider: object | None = None, *, api_key: str = "shadow-test-key"
) -> None:
    settings = Settings(
        decision_engine_provider="openai_compatible",
        llm_shadow_enabled=True,
        llm_model="shadow-test-model",
        llm_base_url="https://shadow.example/v1",
        llm_api_key=api_key,
        llm_timeout_seconds=0.01,
    )
    monkeypatch.setattr("app.engines.provider.get_settings", lambda: settings)
    monkeypatch.setattr("app.services.shadow_evaluation_service.get_settings", lambda: settings)
    if provider is not None:
        monkeypatch.setattr(shadow_evaluation_service, "get_shadow_provider", lambda: provider)


def create_full_flow(
    client: TestClient,
    prefix: str,
    *,
    goal: str = "30 天完成一个 Python 记账程序。",
    foundation: str = "只会变量和循环。",
    constraints: str = "每天 90 分钟。",
) -> dict[str, Any]:
    thread = client.post(
        "/api/threads",
        headers=idempotency(f"{prefix}-thread"),
        json={"title": prefix},
    )
    assert thread.status_code == 201
    thread_id = thread.json()["data"]["id"]

    started = client.post(
        "/api/understanding/analyze",
        headers=idempotency(f"{prefix}-start"),
        json={"thread_id": thread_id, "expression_mode": "speak", "user_input": goal},
    )
    assert started.status_code == 200
    session_id = started.json()["data"]["session"]["id"]
    answers = {
        "desired_result": goal,
        "current_foundation": foundation,
        "real_constraints": constraints,
    }
    response = started
    index = 0
    while next_question := response.json()["data"]["next_question"]:
        response = client.post(
            "/api/understanding/analyze",
            headers=idempotency(f"{prefix}-answer-{index}"),
            json={
                "thread_id": thread_id,
                "session_id": session_id,
                "answer": {"question_id": next_question["id"], "answer_text": answers[next_question["id"]]},
            },
        )
        assert response.status_code == 200
        index += 1
    assert response.json()["data"]["understanding"] is not None

    confirmed = client.post(
        f"/api/understanding/{session_id}/confirm",
        headers=idempotency(f"{prefix}-confirm"),
        json={"assessment": "accurate"},
    )
    assert confirmed.status_code == 200
    created = client.post(
        "/api/plans",
        headers=idempotency(f"{prefix}-plan"),
        json={"thread_id": thread_id, "understanding_session_id": session_id},
    )
    assert created.status_code == 201
    plan = created.json()["data"]["plan"]
    accepted = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=idempotency(f"{prefix}-accept"),
        json={"expected_version": plan["version"]},
    )
    assert accepted.status_code == 200
    feedback_payload = {
        "thread_id": thread_id,
        "plan_id": plan["id"],
        "started": True,
        "completed": False,
        "progress_percent": 60,
        "actual_duration_minutes": 30,
        "obstacle_code": "lack_of_time",
    }
    feedback = client.post(
        "/api/action-results",
        headers=idempotency(f"{prefix}-feedback"),
        json=feedback_payload,
    )
    assert feedback.status_code == 201
    return {
        "thread_id": thread_id,
        "session_id": session_id,
        "plan": plan,
        "feedback_payload": feedback_payload,
        "feedback": feedback.json()["data"],
    }


def evaluations_for(user_id: str, thread_id: str) -> list[ShadowEvaluation]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(ShadowEvaluation)
                .where(ShadowEvaluation.user_id == user_id, ShadowEvaluation.thread_id == thread_id)
                .order_by(ShadowEvaluation.created_at, ShadowEvaluation.id)
            )
        )


def test_shadow_disabled_never_calls_provider_or_creates_records(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unexpected_provider():
        raise AssertionError("shadow provider must not be called while disabled")

    monkeypatch.setattr(shadow_evaluation_service, "get_shadow_provider", unexpected_provider)
    flow = create_full_flow(client, "shadow-disabled")

    assert evaluations_for(client.user_id, flow["thread_id"]) == []  # type: ignore[attr-defined]
    assert flow["feedback"]["current_step"] == "system_revised"


def test_shadow_records_candidates_without_mutating_formal_workflow(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = ContextEchoProvider()
    enable_shadow(monkeypatch, provider)
    flow = create_full_flow(client, "shadow-baseline")

    evaluations = evaluations_for(client.user_id, flow["thread_id"])  # type: ignore[attr-defined]
    assert {record.decision_type for record in evaluations} == {"understanding", "plan", "action_revision"}
    assert all(record.schema_valid for record in evaluations)
    assert all(record.provider_error is None for record in evaluations)
    assert {record.prompt_version for record in evaluations} == {
        "understanding_v1",
        "plan_v1",
        "action_revision_v1",
    }
    assert len(provider.prompts) == 3
    assert all(prompt["context"]["mentor_preferences"]["status"] == "not_collected" for prompt in provider.prompts)
    assert all(
        "mentor_preferences_not_collected" in prompt["context"]["unknown_information"] for prompt in provider.prompts
    )

    with SessionLocal() as session:
        assert session.scalar(select(func.count(Plan.id))) == 1
        assert session.scalar(select(func.count(ActionResult.id))) == 1
        assert session.scalar(select(func.count(UserSnapshot.id))) == 5

    replay = client.post(
        "/api/action-results",
        headers=idempotency("shadow-baseline-feedback"),
        json=flow["feedback_payload"],
    )
    assert replay.status_code == 201
    assert len(evaluations_for(client.user_id, flow["thread_id"])) == 3  # type: ignore[attr-defined]


@pytest.mark.parametrize(
    ("provider", "expected_error"),
    [
        (ContextEchoProvider(lambda _version, _payload: "not-json"), "CANDIDATE_SCHEMA_INVALID"),
        (
            ContextEchoProvider(lambda _version, _payload: json.dumps({"unexpected": "field"})),
            "CANDIDATE_SCHEMA_INVALID",
        ),
    ],
    ids=["invalid-json", "schema-error"],
)
def test_invalid_shadow_output_never_changes_baseline(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    provider: ContextEchoProvider,
    expected_error: str,
) -> None:
    enable_shadow(monkeypatch, provider)
    flow = create_full_flow(client, f"shadow-{expected_error}")

    evaluations = evaluations_for(client.user_id, flow["thread_id"])  # type: ignore[attr-defined]
    assert len(evaluations) == 3
    assert all(not record.schema_valid for record in evaluations)
    assert all(record.provider_error == expected_error for record in evaluations)
    assert flow["feedback"]["current_step"] == "system_revised"


def test_timeout_is_recorded_without_blocking_formal_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class TimeoutProvider(ContextEchoProvider):
        def generate(self, prompt) -> str:
            raise ShadowProviderTimeoutError("test timeout")

    enable_shadow(monkeypatch, TimeoutProvider())
    flow = create_full_flow(client, "shadow-timeout")

    evaluations = evaluations_for(client.user_id, flow["thread_id"])  # type: ignore[attr-defined]
    assert len(evaluations) == 3
    assert all(record.provider_error == "PROVIDER_TIMEOUT" for record in evaluations)
    assert flow["feedback"]["current_step"] == "system_revised"


def test_unconfigured_shadow_records_unavailable_without_provider_call(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(decision_engine_provider="deterministic", llm_shadow_enabled=True)
    monkeypatch.setattr("app.engines.provider.get_settings", lambda: settings)
    monkeypatch.setattr("app.services.shadow_evaluation_service.get_settings", lambda: settings)
    flow = create_full_flow(client, "shadow-unavailable")

    evaluations = evaluations_for(client.user_id, flow["thread_id"])  # type: ignore[attr-defined]
    assert len(evaluations) == 3
    assert all(record.provider_error == "PROVIDER_UNAVAILABLE" for record in evaluations)
    assert all(record.candidate_output is None for record in evaluations)


def test_evaluations_are_user_and_thread_isolated(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    provider = ContextEchoProvider()
    enable_shadow(monkeypatch, provider)
    flow_a = create_full_flow(client, "shadow-user-a")
    user_a = client.user_id  # type: ignore[attr-defined]

    with TestClient(app) as second_client:
        user_b, _headers = invite_and_login(second_client)
        flow_b = create_full_flow(second_client, "shadow-user-b", goal="一个月内学会做三道家常菜。")

    records_a = evaluations_for(user_a, flow_a["thread_id"])
    records_b = evaluations_for(user_b, flow_b["thread_id"])
    assert len(records_a) == len(records_b) == 3
    assert {record.user_id for record in records_a} == {user_a}
    assert {record.user_id for record in records_b} == {user_b}
    assert {record.thread_id for record in records_a} == {flow_a["thread_id"]}
    assert {record.thread_id for record in records_b} == {flow_b["thread_id"]}


def test_api_key_is_not_stored_or_logged(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    secret = "shadow-api-key-must-not-persist"
    enable_shadow(monkeypatch, ContextEchoProvider(), api_key=secret)
    flow = create_full_flow(client, "shadow-secret")

    evaluations = evaluations_for(client.user_id, flow["thread_id"])  # type: ignore[attr-defined]
    serialized = "\n".join(
        json.dumps(
            {
                "baseline": record.baseline_output,
                "candidate": record.candidate_output,
                "error": record.provider_error,
                "provider": record.provider,
                "model": record.model_name,
            },
            ensure_ascii=False,
        )
        for record in evaluations
    )
    assert secret not in serialized
    assert secret not in caplog.text


@pytest.mark.parametrize(
    ("case_id", "goal", "foundation", "constraints"),
    [
        ("ielts", "3 个月内雅思达到 7.5 分。", "总分 6.0，写作 5.5。", "平日每天 2 小时，周日不能学习。"),
        ("python", "30 天完成一个 Python 记账程序。", "只会变量和循环。", "每天 90 分钟。"),
        ("fitness", "建立每周 3 次力量训练习惯。", "无器械训练经验较少。", "无器械，每次 30 分钟。"),
        ("xuanos", "完成 XUANOS 前后端联调。", "已有前端、后端接口和测试。", "本周只有一个完整测试时段。"),
        (
            "multi-goal",
            "暑假想提升英语、健身并开发项目，但不知道先做什么。",
            "三个方向都未确定优先级。",
            "每天稳定投入 4 小时。",
        ),
        ("cooking", "一个月内学会做三道家常菜。", "几乎不会做饭。", "只有周末能练习。"),
    ],
)
def test_each_semantic_case_generates_three_valid_shadow_evaluations(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    case_id: str,
    goal: str,
    foundation: str,
    constraints: str,
) -> None:
    enable_shadow(monkeypatch, ContextEchoProvider())
    flow = create_full_flow(
        client, f"shadow-semantic-{case_id}", goal=goal, foundation=foundation, constraints=constraints
    )

    evaluations = evaluations_for(client.user_id, flow["thread_id"])  # type: ignore[attr-defined]
    assert {record.decision_type for record in evaluations} == {"understanding", "plan", "action_revision"}
    assert all(record.schema_valid for record in evaluations)
    assert all(record.forbidden_term_hits == [] for record in evaluations)


def test_forbidden_legacy_term_is_marked_in_evaluation(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def legacy_plan(version: str, payload: dict[str, Any]) -> str:
        if version != "plan_v1":
            return ContextEchoProvider().generate(
                type("Prompt", (), {"version": version, "messages": [{}, {"content": json.dumps(payload)}]})()
            )
        return json.dumps(
            {
                "stage": "首轮验证",
                "summary": "围绕当前目标安排首轮行动。",
                "single_action": "先完成 Flutter 客户端并验证结果。",
                "completion_standard": "留下一个可检查的结果。",
                "review_condition": "完成后复查。",
                "workload": "low",
                "system_recommendation": "先做最小行动。",
                "items": [
                    {
                        "item_type": "action",
                        "title": "完成 Flutter 客户端。",
                        "sort_order": 1,
                        "estimated_minutes": 30,
                        "completion_standard": "留下结果。",
                    }
                ],
                "maintenance_goals": [],
                "paused_goals": [],
                "deleted_items": [],
                "unknown_information": [],
            },
            ensure_ascii=False,
        )

    enable_shadow(monkeypatch, ContextEchoProvider(legacy_plan))
    flow = create_full_flow(client, "shadow-forbidden")
    plan_record = next(
        record for record in evaluations_for(client.user_id, flow["thread_id"]) if record.decision_type == "plan"
    )  # type: ignore[attr-defined]
    assert plan_record.schema_valid is True
    assert plan_record.forbidden_term_hits == ["Flutter 客户端"]
    assert plan_record.factual_grounding == "fail"


def test_candidate_schema_forbids_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        candidate_schema_for("understanding").model_validate(
            {
                "real_goal": "在三个月内完成一个可验证目标。",
                "foundation": "已有基础信息。",
                "constraints": "每天可以投入 30 分钟。",
                "tension": "需要在时间边界内推进。",
                "uncertain": "实际阻力仍待验证。",
                "unknown_information": [],
                "unapproved_field": "must be rejected",
            }
        )
