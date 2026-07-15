import json

import pytest
from fastapi.testclient import TestClient

LEGACY_DEVELOPMENT_CONTENT = (
    "后端核心闭环",
    "完成五个页面的后端状态接线",
    "Flutter 客户端",
    "完整商业系统",
    "新增 MVP 范围外功能",
)


CASES = (
    {
        "id": "ielts",
        "title": "雅思 7.5",
        "goal": "3 个月内雅思达到 7.5 分。",
        "foundation": "总分 6.0，写作 5.5。",
        "constraints": "平日每天 2 小时，周日不能学习。",
        "feedback": {"started": True, "completed": True, "progress_percent": 100, "minutes": 90},
        "expected_stage": "现状诊断",
        "action_terms": ("雅思", "非周日", "45 分钟"),
    },
    {
        "id": "python",
        "title": "Python 记账程序",
        "goal": "30 天完成一个 Python 记账程序。",
        "foundation": "只会变量和循环。",
        "constraints": "每天 90 分钟。",
        "feedback": {"started": True, "completed": False, "progress_percent": 60, "minutes": 75},
        "revision": "先完成能录入一笔收支并显示余额的命令行版本。",
        "expected_stage": "最小交付验证",
        "action_terms": ("Python", "最小可检查"),
    },
    {
        "id": "fitness",
        "title": "力量训练习惯",
        "goal": "建立每周 3 次力量训练习惯。",
        "foundation": "暂未说明训练基础。",
        "constraints": "无器械，每次 30 分钟。",
        "feedback": {"started": False, "completed": False, "progress_percent": 0, "minutes": None},
        "expected_stage": "习惯试做",
        "action_terms": ("力量训练", "无器械", "30 分钟"),
    },
    {
        "id": "xuanos",
        "title": "XUANOS 联调",
        "goal": "完成 XUANOS 前后端联调。",
        "foundation": "已有前端、后端接口和测试。",
        "constraints": "本周只安排一个完整测试时段。",
        "feedback": {"started": True, "completed": True, "progress_percent": 100, "minutes": 60},
        "expected_stage": "最小交付验证",
        "action_terms": ("XUANOS", "最小可检查"),
    },
    {
        "id": "multi-goal",
        "title": "暑假多目标取舍",
        "goal": "暑假想提升英语、健身并开发项目，但不知道先做什么。",
        "foundation": "三个方向都没有确定优先级。",
        "constraints": "每天稳定投入 4 小时。",
        "feedback": {"started": True, "completed": False, "progress_percent": 40, "minutes": 30},
        "expected_stage": "目标取舍",
        "action_terms": ("唯一主线", "14 天", "30 分钟"),
    },
    {
        "id": "cooking",
        "title": "家常菜学习",
        "goal": "一个月内学会做三道家常菜。",
        "foundation": "几乎不会做饭。",
        "constraints": "只有周末能练习。",
        "feedback": {"started": True, "completed": False, "progress_percent": 50, "minutes": 50},
        "expected_stage": "技能起步练习",
        "action_terms": ("家常菜", "周末", "实际练习"),
    },
)


def idempotency(case_id: str, step: str) -> dict[str, str]:
    return {"Idempotency-Key": f"semantic-{case_id}-{step}"}


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_capture_semantic_acceptance_case(client: TestClient, case: dict) -> None:
    thread_response = client.post(
        "/api/threads",
        headers=idempotency(case["id"], "thread"),
        json={"title": case["title"]},
    )
    assert thread_response.status_code == 201
    thread_id = thread_response.json()["data"]["id"]

    started = client.post(
        "/api/understanding/analyze",
        headers=idempotency(case["id"], "start"),
        json={"thread_id": thread_id, "expression_mode": "speak", "user_input": case["goal"]},
    )
    assert started.status_code == 200
    session_id = started.json()["data"]["session"]["id"]
    answers = {
        "desired_result": case["goal"],
        "current_foundation": case["foundation"],
        "real_constraints": case["constraints"],
    }
    question_ids: list[str] = []
    next_question = started.json()["data"]["next_question"]
    response = started
    index = 0
    while next_question:
        question_id = next_question["id"]
        question_ids.append(question_id)
        response = client.post(
            "/api/understanding/analyze",
            headers=idempotency(case["id"], f"answer-{index}"),
            json={
                "thread_id": thread_id,
                "session_id": session_id,
                "answer": {"question_id": question_id, "answer_text": answers[question_id]},
            },
        )
        assert response.status_code == 200
        next_question = response.json()["data"]["next_question"]
        index += 1

    understanding = response.json()["data"]["understanding"]
    assert question_ids == ["current_foundation", "real_constraints"]
    assert case["goal"] in understanding["real_goal"]
    assert understanding["foundation"] == case["foundation"]
    assert understanding["constraints"] == case["constraints"]
    confirmed = client.post(
        f"/api/understanding/{session_id}/confirm",
        headers=idempotency(case["id"], "confirm"),
        json={"assessment": "accurate"},
    )
    assert confirmed.status_code == 200

    created = client.post(
        "/api/plans",
        headers=idempotency(case["id"], "plan"),
        json={"thread_id": thread_id, "understanding_session_id": session_id},
    )
    assert created.status_code == 201
    plan = created.json()["data"]["plan"]
    generated_plan = plan
    generated_plan_text = "\n".join(
        [
            generated_plan["stage"],
            generated_plan["summary"],
            generated_plan["single_action"],
            generated_plan["completion_standard"],
            generated_plan["system_recommendation"],
            *(item["title"] for item in generated_plan["items"]),
        ]
    )
    assert generated_plan["stage"] == case["expected_stage"]
    assert all(term in generated_plan_text for term in case["action_terms"])
    assert all(value not in generated_plan_text for value in LEGACY_DEVELOPMENT_CONTENT)
    assert [item["item_type"] for item in generated_plan["items"]] == ["action"]

    if revision := case.get("revision"):
        revised = client.post(
            f"/api/plans/{plan['id']}/revise",
            headers=idempotency(case["id"], "revise"),
            json={
                "reason": "ability_limit",
                "user_final_choice": revision,
                "expected_impact_acknowledged": True,
                "expected_version": plan["version"],
            },
        )
        assert revised.status_code == 201
        plan = revised.json()["data"]["current_plan"]

    accepted = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=idempotency(case["id"], "accept"),
        json={"expected_version": plan["version"]},
    )
    assert accepted.status_code == 200
    accepted_snapshot = accepted.json()["data"]["snapshot"]

    feedback_values = case["feedback"]
    feedback = client.post(
        "/api/action-results",
        headers=idempotency(case["id"], "feedback"),
        json={
            "thread_id": thread_id,
            "plan_id": plan["id"],
            "started": feedback_values["started"],
            "completed": feedback_values["completed"],
            "progress_percent": feedback_values["progress_percent"],
            "actual_duration_minutes": feedback_values["minutes"],
            "obstacle_code": "other",
        },
    )
    assert feedback.status_code == 201
    feedback_data = feedback.json()["data"]
    assert feedback_data["snapshot"]["version"] > accepted_snapshot["version"]
    assert feedback_data["snapshot"]["current_action"] != plan["single_action"]
    assert feedback_data["snapshot"]["reality_boundaries"] == [case["constraints"]]
    assert case["goal"] in feedback_data["hypothesis"]["content"]
    assert feedback_data["hypothesis"]["status"] in {"pending", "verified"}

    reloaded = client.get(f"/api/threads/{thread_id}")
    assert reloaded.status_code == 200
    aggregate = reloaded.json()["data"]
    assert aggregate["thread"]["id"] == thread_id
    assert aggregate["thread"]["current_step"] == "system_revised"
    assert aggregate["current_plan"]["id"] == plan["id"]
    assert aggregate["current_snapshot"]["id"] == feedback_data["snapshot"]["id"]
    report = {
        "case": case["id"],
        "questions": question_ids,
        "understanding": understanding,
        "plan": {
            "generated_stage": generated_plan["stage"],
            "stage": plan["stage"],
            "summary": plan["summary"],
            "single_action": plan["single_action"],
            "completion_standard": plan["completion_standard"],
            "items": [{"type": item["item_type"], "title": item["title"]} for item in plan["items"]],
        },
        "revision": feedback_data["system_revision"],
        "snapshot": {
            "version": feedback_data["snapshot"]["version"],
            "current_vector": feedback_data["snapshot"]["current_vector"],
            "current_stage": feedback_data["snapshot"]["current_stage"],
            "current_action": feedback_data["snapshot"]["current_action"],
            "patterns": feedback_data["snapshot"]["effective_patterns"],
            "hypotheses": feedback_data["snapshot"]["hypotheses"],
        },
        "reloaded_step": aggregate["thread"]["current_step"],
        "reloaded_plan_id": aggregate["current_plan"]["id"],
        "reloaded_snapshot_id": aggregate["current_snapshot"]["id"],
    }
    print(json.dumps(report, ensure_ascii=False))
