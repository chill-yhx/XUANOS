from fastapi.testclient import TestClient

FORBIDDEN_DEVELOPMENT_CONTENT = (
    "后端核心闭环",
    "完成五个页面的后端状态接线",
    "每周 3 次基础健身",
    "Flutter 客户端",
    "完整商业系统",
    "新增 MVP 范围外功能",
    "完成 XUANOS 静态前端原型",
)


def idempotency(key: str) -> dict[str, str]:
    return {"Idempotency-Key": key}


def test_ielts_flow_uses_submitted_context_not_development_defaults(client: TestClient) -> None:
    thread = client.post(
        "/api/threads",
        headers=idempotency("decision-engine-ielts-thread"),
        json={"title": "雅思 7.5 分"},
    )
    assert thread.status_code == 201
    thread_id = thread.json()["data"]["id"]

    started = client.post(
        "/api/understanding/analyze",
        headers=idempotency("decision-engine-ielts-start"),
        json={
            "thread_id": thread_id,
            "expression_mode": "speak",
            "user_input": "我想达到雅思总分 7.5 分。",
        },
    )
    assert started.status_code == 200
    session_id = started.json()["data"]["session"]["id"]

    answers = {
        "desired_result": "雅思总分达到 7.5 分，单项不低于 7 分。",
        "current_foundation": "目前总分 6.0，阅读相对稳定，已经有备考资料。",
        "real_constraints": "工作日每天 90 分钟，周末每天最多 3 小时。",
    }
    summary = None
    next_question = started.json()["data"]["next_question"]
    index = 0
    while next_question:
        question_id = next_question["id"]
        response = client.post(
            "/api/understanding/analyze",
            headers=idempotency(f"decision-engine-ielts-answer-{index}"),
            json={
                "thread_id": thread_id,
                "session_id": session_id,
                "answer": {"question_id": question_id, "answer_text": answers[question_id]},
            },
        )
        assert response.status_code == 200
        summary = response.json()["data"]
        next_question = summary["next_question"]
        index += 1

    assert summary is not None
    assert "雅思" in summary["understanding"]["real_goal"]
    assert "90 分钟" in summary["understanding"]["constraints"]

    confirmed = client.post(
        f"/api/understanding/{session_id}/confirm",
        headers=idempotency("decision-engine-ielts-confirm"),
        json={"assessment": "accurate"},
    )
    assert confirmed.status_code == 200
    confirmed_data = confirmed.json()["data"]
    assert "雅思" in confirmed_data["snapshot"]["current_vector"]
    assert "雅思" in confirmed_data["snapshot"]["hypotheses"][0]["content"]

    created = client.post(
        "/api/plans",
        headers=idempotency("decision-engine-ielts-plan"),
        json={"thread_id": thread_id, "understanding_session_id": session_id},
    )
    assert created.status_code == 201
    plan = created.json()["data"]["plan"]
    plan_text = "\n".join(
        [
            plan["stage"],
            plan["summary"],
            plan["single_action"],
            plan["completion_standard"],
            plan["review_condition"],
            plan["system_recommendation"],
            *(item["title"] for item in plan["items"]),
        ]
    )
    assert "雅思" in plan_text
    assert all(content not in plan_text for content in FORBIDDEN_DEVELOPMENT_CONTENT)
    assert [item["item_type"] for item in plan["items"]] == ["action"]

    accepted = client.post(
        f"/api/plans/{plan['id']}/accept",
        headers=idempotency("decision-engine-ielts-accept"),
        json={"expected_version": plan["version"]},
    )
    assert accepted.status_code == 200

    feedback = client.post(
        "/api/action-results",
        headers=idempotency("decision-engine-ielts-feedback"),
        json={
            "thread_id": thread_id,
            "plan_id": plan["id"],
            "started": True,
            "completed": True,
            "progress_percent": 100,
            "actual_duration_minutes": 45,
            "obstacle_code": "lack_of_time",
        },
    )
    assert feedback.status_code == 201
    feedback_data = feedback.json()["data"]
    revision_text = "\n".join(
        [
            feedback_data["system_revision"]["actual_result"],
            feedback_data["system_revision"]["revised_judgment"],
            feedback_data["system_revision"]["next_adjustment"],
            feedback_data["snapshot"]["current_action"],
        ]
    )
    assert "雅思" in revision_text
    assert all(content not in revision_text for content in FORBIDDEN_DEVELOPMENT_CONTENT)
