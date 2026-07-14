from dataclasses import dataclass
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.main import app
from app.models.action_result import ActionResult
from app.models.hypothesis import Hypothesis
from app.models.idempotency import IdempotencyRecord
from app.models.plan import Plan
from app.models.snapshot import UserSnapshot
from app.models.thread import Thread
from app.models.understanding import Answer, UserCorrection
from app.services.snapshot_service import SnapshotService


@dataclass
class FlowContext:
    thread_id: str
    understanding_session_id: str
    plan_v1_id: str | None = None
    plan_v2_id: str | None = None


def idempotency(value: str) -> dict[str, str]:
    return {"Idempotency-Key": value}


def create_thread(client: TestClient, title: str = "后端核心闭环") -> str:
    response = client.post(
        "/api/threads",
        headers=idempotency(f"create-thread-{uuid4().hex}"),
        json={"title": title},
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


def analyze_understanding(client: TestClient, thread_id: str, key_prefix: str) -> FlowContext:
    first = client.post(
        "/api/understanding/analyze",
        headers=idempotency(f"{key_prefix}-start"),
        json={
            "thread_id": thread_id,
            "expression_mode": "speak",
            "user_input": "我想完成 XUANOS 后端核心闭环。",
        },
    )
    assert first.status_code == 200
    data = first.json()["data"]
    assert data["next_question"]["id"] == "desired_result"
    session_id = data["session"]["id"]

    answers = [
        ("desired_result", "让后端完整支持理解、计划、反馈和快照更新。"),
        ("current_foundation", "已有前端 Mock 流程、后端基础工程和接口规格。"),
        ("real_constraints", "本轮不接真实 AI、不改前端、不做登录支付。"),
    ]
    last = None
    for index, (question_id, answer_text) in enumerate(answers):
        last = client.post(
            "/api/understanding/analyze",
            headers=idempotency(f"{key_prefix}-answer-{index}"),
            json={
                "thread_id": thread_id,
                "session_id": session_id,
                "answer": {"question_id": question_id, "answer_text": answer_text},
            },
        )
        assert last.status_code == 200

    assert last is not None
    result = last.json()["data"]
    assert result["current_step"] == "reviewing_understanding"
    assert result["next_question"] is None
    assert result["understanding"]["real_goal"].startswith("让后端完整支持")
    return FlowContext(thread_id=thread_id, understanding_session_id=session_id)


def confirm_understanding(client: TestClient, context: FlowContext, key_prefix: str) -> None:
    correction = client.post(
        f"/api/understanding/{context.understanding_session_id}/confirm",
        headers=idempotency(f"{key_prefix}-correction"),
        json={"assessment": "partial", "correction": "当前重点是验证服务端流程守卫。"},
    )
    assert correction.status_code == 200
    correction_data = correction.json()["data"]
    assert correction_data["current_step"] == "reviewing_understanding"
    assert correction_data["correction"]["user_value"] == "当前重点是验证服务端流程守卫。"

    confirmed = client.post(
        f"/api/understanding/{context.understanding_session_id}/confirm",
        headers=idempotency(f"{key_prefix}-confirm"),
        json={"assessment": "accurate"},
    )
    assert confirmed.status_code == 200
    data = confirmed.json()["data"]
    assert data["current_step"] == "understanding_confirmed"
    assert data["session"]["status"] == "confirmed"
    assert data["snapshot"]["version"] >= 2


def create_and_revise_plan(client: TestClient, context: FlowContext, key_prefix: str) -> None:
    created = client.post(
        "/api/plans",
        headers=idempotency(f"{key_prefix}-plan-v1"),
        json={"thread_id": context.thread_id, "understanding_session_id": context.understanding_session_id},
    )
    assert created.status_code == 201
    plan_v1 = created.json()["data"]["plan"]
    assert plan_v1["version"] == 1
    assert plan_v1["root_plan_id"] == plan_v1["id"]
    context.plan_v1_id = plan_v1["id"]

    revised = client.post(
        f"/api/plans/{plan_v1['id']}/revise",
        headers=idempotency(f"{key_prefix}-plan-v2"),
        json={
            "reason": "time_conflict",
            "user_final_choice": "先完成理解与计划接口的完整测试",
            "expected_impact_acknowledged": True,
            "expected_version": 1,
        },
    )
    assert revised.status_code == 201
    data = revised.json()["data"]
    assert data["previous_plan"]["version"] == 1
    assert data["current_plan"]["version"] == 2
    assert data["current_plan"]["root_plan_id"] == plan_v1["root_plan_id"]
    assert data["current_plan"]["previous_plan_id"] == plan_v1["id"]
    assert data["current_plan"]["single_action"] == "先完成理解与计划接口的完整测试"
    context.plan_v2_id = data["current_plan"]["id"]


def accept_plan(client: TestClient, context: FlowContext, key_prefix: str) -> dict:
    assert context.plan_v2_id is not None
    accepted = client.post(
        f"/api/plans/{context.plan_v2_id}/accept",
        headers=idempotency(f"{key_prefix}-accept"),
        json={"expected_version": 2},
    )
    assert accepted.status_code == 200
    data = accepted.json()["data"]
    assert data["plan"]["status"] == "accepted"
    assert data["current_step"] == "action_pending"
    return data


def test_full_core_flow_and_idempotent_feedback(client: TestClient) -> None:
    context = analyze_understanding(client, create_thread(client), "full-flow")

    blocked = client.post(
        "/api/plans",
        headers=idempotency("full-flow-plan-blocked"),
        json={"thread_id": context.thread_id, "understanding_session_id": context.understanding_session_id},
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "UNDERSTANDING_NOT_CONFIRMED"

    confirm_understanding(client, context, "full-flow")
    create_and_revise_plan(client, context, "full-flow")
    accepted = accept_plan(client, context, "full-flow")
    snapshot_before_feedback = accepted["snapshot"]["version"]
    accepted_at = accepted["plan"]["accepted_at"]
    assert context.plan_v1_id is not None
    assert context.plan_v2_id is not None

    accepted_replay = client.post(
        f"/api/plans/{context.plan_v2_id}/accept",
        headers=idempotency("full-flow-accept"),
        json={"expected_version": 2},
    )
    assert accepted_replay.status_code == 200
    assert accepted_replay.json()["data"] == accepted

    accepted_again = client.post(
        f"/api/plans/{context.plan_v2_id}/accept",
        headers=idempotency("full-flow-accept-second-key"),
        json={"expected_version": 2},
    )
    assert accepted_again.status_code == 200
    assert accepted_again.json()["data"]["snapshot"]["id"] == accepted["snapshot"]["id"]
    assert accepted_again.json()["data"]["plan"]["accepted_at"].removesuffix("Z") == accepted_at.removesuffix("Z")
    assert accepted_again.json()["data"]["current_step"] == "action_pending"

    superseded = client.post(
        f"/api/plans/{context.plan_v1_id}/accept",
        headers=idempotency("full-flow-accept-superseded-v1"),
        json={"expected_version": 1},
    )
    assert superseded.status_code == 409
    assert superseded.json()["error"]["code"] == "INVALID_FLOW_STATE"

    before_feedback = client.get(f"/api/threads/{context.thread_id}").json()["data"]
    assert before_feedback["thread"]["active_plan_id"] == context.plan_v2_id
    assert before_feedback["thread"]["current_step"] == "action_pending"
    assert before_feedback["current_plan"]["id"] == context.plan_v2_id

    payload = {
        "thread_id": context.thread_id,
        "plan_id": context.plan_v2_id,
        "started": True,
        "completed": False,
        "progress_percent": 70,
        "actual_duration_minutes": 55,
        "obstacle_code": "time_conflict",
        "energy_change": "开始后更专注",
        "unrealistic_part": "原计划范围偏大",
    }
    submitted = client.post(
        "/api/action-results",
        headers=idempotency("full-flow-action-result"),
        json=payload,
    )
    assert submitted.status_code == 201
    result = submitted.json()["data"]
    assert result["current_step"] == "system_revised"
    assert result["snapshot"]["version"] == snapshot_before_feedback + 1
    assert result["snapshot"]["source_action_result_id"] == result["action_result"]["id"]
    assert result["hypothesis"]["supporting_evidence"]

    accepted_after_feedback = client.post(
        f"/api/plans/{context.plan_v2_id}/accept",
        headers=idempotency("full-flow-accept-after-feedback"),
        json={"expected_version": 2},
    )
    assert accepted_after_feedback.status_code == 200
    after_feedback_data = accepted_after_feedback.json()["data"]
    assert after_feedback_data["current_step"] == "system_revised"
    assert after_feedback_data["plan"]["accepted_at"].removesuffix("Z") == accepted_at.removesuffix("Z")
    assert after_feedback_data["snapshot"]["id"] == result["snapshot"]["id"]

    replayed = client.post(
        "/api/action-results",
        headers=idempotency("full-flow-action-result"),
        json=payload,
    )
    assert replayed.status_code == 201
    assert replayed.json()["data"]["action_result"]["id"] == result["action_result"]["id"]
    assert replayed.json()["data"]["snapshot"]["id"] == result["snapshot"]["id"]

    conflict_payload = {**payload, "progress_percent": 71}
    conflict = client.post(
        "/api/action-results",
        headers=idempotency("full-flow-action-result"),
        json=conflict_payload,
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "DUPLICATE_SUBMISSION"

    with SessionLocal() as session:
        assert session.scalar(select(func.count(ActionResult.id))) == 1
        assert session.scalar(select(func.count(UserSnapshot.id))) == result["snapshot"]["version"]
        replay_record_count = session.scalar(
            select(func.count(IdempotencyRecord.id)).where(
                IdempotencyRecord.route == f"POST /api/plans/{context.plan_v2_id}/accept",
                IdempotencyRecord.key == "full-flow-accept",
            )
        )
        assert replay_record_count == 1
        plans = list(session.scalars(select(Plan).order_by(Plan.version)))
        assert len(plans) == 2
        assert plans[0].id == context.plan_v1_id
        assert plans[0].single_action != plans[1].single_action
        hypothesis = session.scalar(select(Hypothesis).where(Hypothesis.thread_id == context.thread_id))
        assert hypothesis is not None
        assert hypothesis.status == "pending"
        assert len(hypothesis.supporting_evidence) == 1
        plan_correction = session.scalar(
            select(UserCorrection).where(
                UserCorrection.thread_id == context.thread_id,
                UserCorrection.target_type == "plan",
            )
        )
        assert plan_correction is not None
        assert plan_correction.user_value == "先完成理解与计划接口的完整测试"

    detail = client.get(f"/api/threads/{context.thread_id}")
    aggregate = detail.json()["data"]
    assert len(aggregate["plan_versions"]) == 2
    assert aggregate["thread"]["active_plan_id"] == context.plan_v2_id
    assert aggregate["thread"]["current_step"] == "system_revised"
    assert aggregate["current_plan"]["id"] == context.plan_v2_id
    assert aggregate["current_plan"]["status"] == "accepted"
    assert aggregate["latest_action_result"]["id"] == result["action_result"]["id"]
    assert aggregate["current_snapshot"]["id"] == result["snapshot"]["id"]

    with TestClient(app, headers={"Authorization": client.headers["Authorization"]}) as restarted_client:
        restored = restarted_client.get(f"/api/threads/{context.thread_id}")
    assert restored.status_code == 200
    assert restored.json()["data"]["thread"]["current_step"] == "system_revised"


def test_feedback_requires_accepted_plan(client: TestClient) -> None:
    context = analyze_understanding(client, create_thread(client, "非法流程测试"), "guard-flow")
    confirm_understanding(client, context, "guard-flow")
    created = client.post(
        "/api/plans",
        headers=idempotency("guard-flow-plan-v1"),
        json={"thread_id": context.thread_id, "understanding_session_id": context.understanding_session_id},
    )
    plan_id = created.json()["data"]["plan"]["id"]

    response = client.post(
        "/api/action-results",
        headers=idempotency("guard-flow-action"),
        json={
            "thread_id": context.thread_id,
            "plan_id": plan_id,
            "started": False,
            "completed": False,
            "progress_percent": 0,
            "obstacle_code": "action_unclear",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PLAN_NOT_ACCEPTED"


def test_thread_aggregate_safely_derives_legacy_accepted_step(client: TestClient) -> None:
    context = analyze_understanding(client, create_thread(client, "旧状态恢复测试"), "legacy-accept")
    confirm_understanding(client, context, "legacy-accept")
    created = client.post(
        "/api/plans",
        headers=idempotency("legacy-accept-plan"),
        json={"thread_id": context.thread_id, "understanding_session_id": context.understanding_session_id},
    )
    plan = created.json()["data"]["plan"]
    accepted = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=idempotency("legacy-accept-first"),
        json={"expected_version": plan["version"]},
    )
    assert accepted.status_code == 200

    with SessionLocal() as session:
        thread = session.get(Thread, context.thread_id)
        assert thread is not None
        thread.current_step = "plan_accepted"
        session.commit()

    aggregate = client.get(f"/api/threads/{context.thread_id}")
    assert aggregate.status_code == 200
    assert aggregate.json()["data"]["thread"]["current_step"] == "action_pending"
    assert aggregate.json()["data"]["thread"]["active_plan_id"] == plan["id"]

    replay_with_new_key = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=idempotency("legacy-accept-repair"),
        json={"expected_version": plan["version"]},
    )
    assert replay_with_new_key.status_code == 200
    assert replay_with_new_key.json()["data"]["current_step"] == "action_pending"

    with SessionLocal() as session:
        thread = session.get(Thread, context.thread_id)
        assert thread is not None
        assert thread.current_step == "action_pending"


def test_answer_revision_is_append_only(client: TestClient) -> None:
    thread_id = create_thread(client, "回答版本测试")
    started = client.post(
        "/api/understanding/analyze",
        headers=idempotency("answer-revision-start"),
        json={"thread_id": thread_id, "expression_mode": "ask"},
    )
    session_id = started.json()["data"]["session"]["id"]
    first_payload = {
        "thread_id": thread_id,
        "session_id": session_id,
        "answer": {"question_id": "desired_result", "answer_text": "第一版目标"},
    }
    assert (
        client.post(
            "/api/understanding/analyze",
            headers=idempotency("answer-revision-v1"),
            json=first_payload,
        ).status_code
        == 200
    )
    revised_payload = {
        **first_payload,
        "answer": {"question_id": "desired_result", "answer_text": "第二版目标"},
    }
    assert (
        client.post(
            "/api/understanding/analyze",
            headers=idempotency("answer-revision-v2"),
            json=revised_payload,
        ).status_code
        == 200
    )

    with SessionLocal() as session:
        answers = list(
            session.scalars(
                select(Answer)
                .where(Answer.understanding_session_id == session_id, Answer.question_id == "desired_result")
                .order_by(Answer.revision)
            )
        )
    assert [answer.answer_text for answer in answers] == ["第一版目标", "第二版目标"]
    assert [answer.is_current for answer in answers] == [False, True]


def test_plan_accept_transaction_rolls_back_when_snapshot_fails(client: TestClient, monkeypatch) -> None:
    context = analyze_understanding(client, create_thread(client, "计划接受回滚测试"), "accept-rollback")
    confirm_understanding(client, context, "accept-rollback")
    created = client.post(
        "/api/plans",
        headers=idempotency("accept-rollback-plan"),
        json={"thread_id": context.thread_id, "understanding_session_id": context.understanding_session_id},
    )
    plan_id = created.json()["data"]["plan"]["id"]
    with SessionLocal() as session:
        snapshot_count_before = session.scalar(select(func.count(UserSnapshot.id)))

    def fail_snapshot(*args, **kwargs):
        raise RuntimeError("forced snapshot failure")

    monkeypatch.setattr(SnapshotService, "create_version", fail_snapshot)
    with TestClient(
        app,
        headers={"Authorization": client.headers["Authorization"]},
        raise_server_exceptions=False,
    ) as failure_client:
        response = failure_client.post(
            f"/api/plans/{plan_id}/accept",
            headers=idempotency("accept-rollback-request"),
            json={"expected_version": 1},
        )
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"

    with SessionLocal() as session:
        plan = session.get(Plan, plan_id)
        thread = session.get(Thread, context.thread_id)
        assert plan is not None
        assert plan.status == "generated"
        assert plan.accepted_at is None
        assert thread is not None
        assert thread.active_plan_id == plan_id
        assert thread.current_step == "plan_generated"
        assert session.scalar(select(func.count(UserSnapshot.id))) == snapshot_count_before
        assert (
            session.scalar(
                select(func.count(IdempotencyRecord.id)).where(
                    IdempotencyRecord.route == f"POST /api/plans/{plan_id}/accept",
                    IdempotencyRecord.key == "accept-rollback-request",
                )
            )
            == 0
        )


def test_feedback_transaction_rolls_back_when_snapshot_fails(client: TestClient, monkeypatch) -> None:
    context = analyze_understanding(client, create_thread(client, "事务回滚测试"), "rollback-flow")
    confirm_understanding(client, context, "rollback-flow")
    created = client.post(
        "/api/plans",
        headers=idempotency("rollback-flow-plan"),
        json={"thread_id": context.thread_id, "understanding_session_id": context.understanding_session_id},
    )
    plan_id = created.json()["data"]["plan"]["id"]
    accepted = client.post(
        f"/api/plans/{plan_id}/accept",
        headers=idempotency("rollback-flow-accept"),
        json={"expected_version": 1},
    )
    assert accepted.status_code == 200
    snapshot_before = accepted.json()["data"]["snapshot"]["version"]

    def fail_snapshot(*args, **kwargs):
        raise RuntimeError("forced snapshot failure")

    monkeypatch.setattr(SnapshotService, "create_version", fail_snapshot)
    with TestClient(
        app,
        headers={"Authorization": client.headers["Authorization"]},
        raise_server_exceptions=False,
    ) as failure_client:
        response = failure_client.post(
            "/api/action-results",
            headers=idempotency("rollback-flow-action"),
            json={
                "thread_id": context.thread_id,
                "plan_id": plan_id,
                "started": False,
                "completed": False,
                "progress_percent": 0,
                "obstacle_code": "action_unclear",
            },
        )
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"

    with SessionLocal() as session:
        action_count = session.scalar(
            select(func.count(ActionResult.id)).where(ActionResult.thread_id == context.thread_id)
        )
        assert action_count == 0
        thread = session.get(Thread, context.thread_id)
        assert thread is not None
        assert thread.current_step == "action_pending"
        hypothesis = session.scalar(select(Hypothesis).where(Hypothesis.thread_id == context.thread_id))
        assert hypothesis is not None
        assert hypothesis.supporting_evidence == []
        snapshot_count = session.scalar(select(func.count(UserSnapshot.id)))
        assert snapshot_count == snapshot_before
