from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import func, select

from alembic import command

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

DECISION_TYPES = ("understanding", "plan", "action_revision")
ERROR_STATUSES = {
    "PROVIDER_UNAVAILABLE": "provider_unavailable",
    "PROVIDER_TIMEOUT": "timeout",
    "PROVIDER_TRANSPORT_ERROR": "transport_error",
    "PROVIDER_AUTH_ERROR": "transport_error",
    "PROVIDER_PAYMENT_REQUIRED": "transport_error",
    "PROVIDER_RATE_LIMITED": "transport_error",
    "PROVIDER_INVALID_RESPONSE": "invalid_json",
    "CANDIDATE_INVALID_JSON": "invalid_json",
    "CANDIDATE_SCHEMA_INVALID": "schema_invalid",
    "EVALUATION_FAILED": "evaluation_failed",
}


@dataclass(frozen=True)
class ShadowCase:
    id: str
    title: str
    goal: str
    foundation: str
    constraints: str
    started: bool
    completed: bool
    progress_percent: int
    actual_duration_minutes: int | None
    obstacle_code: str
    obstacle_detail: str | None = None

    def answer_for(self, question_id: str) -> str:
        answers = {
            "desired_result": self.goal,
            "current_foundation": self.foundation,
            "real_constraints": self.constraints,
        }
        if question_id not in answers:
            raise ShadowFlowError(f"Unsupported understanding question: {question_id}")
        return answers[question_id]


CASES = {
    case.id: case
    for case in (
        ShadowCase(
            id="ielts",
            title="雅思 7.5",
            goal="3 个月内雅思达到 7.5 分。",
            foundation="总分 6.0，写作 5.5。",
            constraints="平日每天 2 小时，周日不能学习。",
            started=True,
            completed=False,
            progress_percent=70,
            actual_duration_minutes=90,
            obstacle_code="task_too_large",
            obstacle_detail="写作复盘比预计耗时。",
        ),
        ShadowCase(
            id="python",
            title="Python 记账程序",
            goal="30 天完成一个可以录入收支并查看余额的 Python 记账程序。",
            foundation="只会变量和循环。",
            constraints="每天可以投入 90 分钟。",
            started=True,
            completed=True,
            progress_percent=100,
            actual_duration_minutes=80,
            obstacle_code="missing_resource",
            obstacle_detail="需要查阅文件存储的基础资料。",
        ),
        ShadowCase(
            id="fitness",
            title="无器械力量训练",
            goal="建立每周 3 次力量训练习惯。",
            foundation="有少量徒手训练经验，但没有稳定习惯。",
            constraints="没有器械，每次最多 30 分钟。",
            started=True,
            completed=False,
            progress_percent=60,
            actual_duration_minutes=20,
            obstacle_code="low_energy",
            obstacle_detail="下班后精力不足。",
        ),
        ShadowCase(
            id="cooking",
            title="三道家常菜",
            goal="一个月内学会独立做三道家常菜。",
            foundation="几乎不会做饭，只会使用电饭煲。",
            constraints="只有周末能练习，每次最多 2 小时。",
            started=True,
            completed=True,
            progress_percent=100,
            actual_duration_minutes=75,
            obstacle_code="other",
            obstacle_detail="切配比预期慢。",
        ),
        ShadowCase(
            id="math",
            title="数学提分",
            goal="8 周内把高中数学月考成绩从 70 分提高到 90 分。",
            foundation="函数和数列失分较多，已有最近三次试卷。",
            constraints="平日每天 45 分钟，周六可以投入 2 小时。",
            started=True,
            completed=False,
            progress_percent=50,
            actual_duration_minutes=45,
            obstacle_code="unclear_action",
            obstacle_detail="错题分类标准不够清楚。",
        ),
        ShadowCase(
            id="liuyao",
            title="六爻入门学习",
            goal="6 周完成六爻基础入门，能够独立记录一次起卦过程并解释基础术语。",
            foundation="只听说过阴阳和六爻，还没有系统学习。",
            constraints="每天最多 30 分钟，只把它作为文化知识学习，不用于重大现实决策。",
            started=True,
            completed=False,
            progress_percent=40,
            actual_duration_minutes=25,
            obstacle_code="missing_resource",
            obstacle_detail="术语资料来源较分散。",
        ),
        ShadowCase(
            id="multi-goal",
            title="多目标冲突",
            goal="暑假想提升英语、健身并开发项目，但不知道先做什么。",
            foundation="三个方向都开始过，但没有稳定优先级。",
            constraints="每天可以稳定投入 4 小时。",
            started=True,
            completed=False,
            progress_percent=40,
            actual_duration_minutes=30,
            obstacle_code="emotional_resistance",
            obstacle_detail="担心选一个方向会耽误其他目标。",
        ),
        ShadowCase(
            id="twenty-minutes",
            title="每天只有 20 分钟",
            goal="30 天内整理并发布一个个人作品集页面。",
            foundation="已经有三个可展示项目，但素材散落。",
            constraints="每天只有 20 分钟，周末也不能额外投入。",
            started=True,
            completed=True,
            progress_percent=100,
            actual_duration_minutes=18,
            obstacle_code="lack_of_time",
            obstacle_detail="可用时间非常碎片化。",
        ),
        ShadowCase(
            id="vague-goal",
            title="目标模糊",
            goal="我想让自己变得更好，但现在不知道具体从哪里开始。",
            foundation="目前没有明确方向，也没有可检查的结果定义。",
            constraints="每天可以投入 45 分钟，但暂时不愿承诺长期计划。",
            started=False,
            completed=False,
            progress_percent=0,
            actual_duration_minutes=None,
            obstacle_code="unclear_action",
            obstacle_detail="不知道什么行动才算有效。",
        ),
        ShadowCase(
            id="unrealistic-goal",
            title="明显不现实的目标",
            goal="7 天内从零基础达到日语 N1 水平。",
            foundation="不会日语假名，也没有日语学习经验。",
            constraints="每天最多 30 分钟，不能购买课程。",
            started=True,
            completed=False,
            progress_percent=10,
            actual_duration_minutes=30,
            obstacle_code="task_too_large",
            obstacle_detail="首轮任务远超当前基础。",
        ),
        ShadowCase(
            id="insufficient-info",
            title="信息严重不足",
            goal="我想开始一个新项目，但还不知道要做什么。",
            foundation="不知道，暂时无法提供已有基础。",
            constraints="不知道，时间、资源和截止日期都还没有确定。",
            started=False,
            completed=False,
            progress_percent=0,
            actual_duration_minutes=None,
            obstacle_code="unclear_action",
            obstacle_detail="目标和现实边界都缺少信息。",
        ),
        ShadowCase(
            id="xuanos",
            title="XUANOS 前后端联调",
            goal="完成 XUANOS 前后端联调并跑通一次完整核心流程。",
            foundation="前端 API 层、后端核心接口和自动化测试已经存在。",
            constraints="本周只有一个 2 小时的完整测试时段。",
            started=True,
            completed=True,
            progress_percent=100,
            actual_duration_minutes=110,
            obstacle_code="environment_interrupt",
            obstacle_detail="本地服务启动顺序造成一次中断。",
        ),
    )
}


class ShadowFlowError(RuntimeError):
    pass


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run isolated real-provider XUANOS shadow evaluations.")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--case", choices=sorted(CASES), help="Run one semantic case.")
    selection.add_argument("--all", action="store_true", help="Run all semantic cases.")
    parser.add_argument(
        "--output",
        type=Path,
        help="JSON or Markdown report path; a companion report in the other format is also written.",
    )
    parser.add_argument(
        "--evaluation-wait-seconds",
        type=float,
        default=5.0,
        help="Additional wait after each formal flow for background evaluation persistence.",
    )
    return parser.parse_args(argv)


def evaluation_status(schema_valid: bool, provider_error: str | None) -> str:
    if schema_valid and provider_error is None:
        return "passed"
    if provider_error is None:
        return "evaluation_failed"
    return ERROR_STATUSES.get(provider_error, "evaluation_failed")


def _safe_response(response: Any, expected_status: int, operation: str) -> dict[str, Any]:
    if response.status_code != expected_status:
        try:
            payload = response.json()
            error = payload.get("error", {})
            detail = f"{error.get('code', 'HTTP_ERROR')}: {error.get('message', 'request failed')}"
        except (TypeError, ValueError):
            detail = f"HTTP {response.status_code}"
        raise ShadowFlowError(f"{operation} failed ({detail})")
    return response.json()["data"]


def _idempotency(run_id: str, case_id: str, step: str) -> dict[str, str]:
    return {"Idempotency-Key": f"real-shadow-{run_id}-{case_id}-{step}"}


def _wait_for_evaluations(
    session_factory: Any,
    *,
    user_id: str,
    thread_id: str,
    wait_seconds: float,
) -> list[Any]:
    from app.models.shadow_evaluation import ShadowEvaluation

    deadline = time.monotonic() + max(0.0, wait_seconds)
    while True:
        with session_factory() as session:
            records = list(
                session.scalars(
                    select(ShadowEvaluation)
                    .where(ShadowEvaluation.user_id == user_id, ShadowEvaluation.thread_id == thread_id)
                    .order_by(ShadowEvaluation.created_at, ShadowEvaluation.id)
                )
            )
        if {record.decision_type for record in records} == set(DECISION_TYPES):
            return records
        if time.monotonic() >= deadline:
            return records
        time.sleep(0.1)


def _evaluation_payload(record: Any | None) -> dict[str, Any]:
    if record is None:
        return {
            "status": "evaluation_failed",
            "baseline_output": None,
            "candidate_output": None,
            "schema_valid": False,
            "latency_ms": None,
            "provider_error": "EVALUATION_MISSING",
            "goal_alignment": "unknown",
            "constraint_adherence": "unknown",
            "factual_grounding": "unknown",
            "actionability": "unknown",
            "unsupported_assumptions": [],
            "baseline_divergence": "unknown",
            "forbidden_term_hits": [],
        }
    return {
        "status": evaluation_status(record.schema_valid, record.provider_error),
        "evaluation_id": record.id,
        "prompt_version": record.prompt_version,
        "context_hash": record.context_hash,
        "baseline_output": record.baseline_output,
        "candidate_output": record.candidate_output,
        "schema_valid": record.schema_valid,
        "latency_ms": record.latency_ms,
        "provider_error": record.provider_error,
        "goal_alignment": record.goal_alignment,
        "constraint_adherence": record.constraint_adherence,
        "factual_grounding": record.factual_grounding,
        "actionability": record.actionability,
        "unsupported_assumptions": record.unsupported_assumptions,
        "baseline_divergence": record.baseline_divergence,
        "forbidden_term_hits": record.forbidden_term_hits,
    }


def _formal_state_counts(session_factory: Any, *, user_id: str, thread_id: str) -> dict[str, Any]:
    from app.models.action_result import ActionResult
    from app.models.hypothesis import Hypothesis
    from app.models.plan import Plan
    from app.models.shadow_evaluation import ShadowEvaluation
    from app.models.snapshot import UserSnapshot
    from app.models.thread import Thread
    from app.models.understanding import UnderstandingSession, UserCorrection

    with session_factory() as session:
        filters = {"user_id": user_id, "thread_id": thread_id}
        counts = {
            "thread_count": session.scalar(
                select(func.count(Thread.id)).where(Thread.user_id == user_id, Thread.id == thread_id)
            ),
            "understanding_session_count": session.scalar(
                select(func.count(UnderstandingSession.id)).filter_by(**filters)
            ),
            "plan_count": session.scalar(select(func.count(Plan.id)).filter_by(**filters)),
            "action_result_count": session.scalar(select(func.count(ActionResult.id)).filter_by(**filters)),
            "hypothesis_count": session.scalar(select(func.count(Hypothesis.id)).filter_by(**filters)),
            "correction_count": session.scalar(select(func.count(UserCorrection.id)).filter_by(**filters)),
            "snapshot_count": session.scalar(
                select(func.count(UserSnapshot.id)).where(UserSnapshot.user_id == user_id)
            ),
            "evaluation_count": session.scalar(select(func.count(ShadowEvaluation.id)).filter_by(**filters)),
        }
    violations: list[str] = []
    expected_counts = {
        "thread_count": 1,
        "understanding_session_count": 1,
        "plan_count": 1,
        "action_result_count": 1,
        "hypothesis_count": 1,
        "correction_count": 0,
        "evaluation_count": 3,
    }
    for field, expected in expected_counts.items():
        if counts[field] != expected:
            violations.append(f"{field} expected {expected}, got {counts[field]}")
    return {**counts, "violations": violations, "shadow_isolated": not violations}


def run_case(
    client: Any,
    session_factory: Any,
    *,
    case: ShadowCase,
    run_id: str,
    wait_seconds: float,
) -> dict[str, Any]:
    identity = _safe_response(client.post("/api/sessions"), 201, "create session")
    user_id = identity["user_id"]
    auth = {"Authorization": f"Bearer {identity['access_token']}"}

    thread = _safe_response(
        client.post(
            "/api/threads",
            headers={**auth, **_idempotency(run_id, case.id, "thread")},
            json={"title": case.title},
        ),
        201,
        "create thread",
    )
    thread_id = thread["id"]
    started = _safe_response(
        client.post(
            "/api/understanding/analyze",
            headers={**auth, **_idempotency(run_id, case.id, "understanding-start")},
            json={"thread_id": thread_id, "expression_mode": "speak", "user_input": case.goal},
        ),
        200,
        "start understanding",
    )
    understanding_session_id = started["session"]["id"]
    response = started
    question_ids: list[str] = []
    answer_index = 0
    while next_question := response["next_question"]:
        question_id = next_question["id"]
        question_ids.append(question_id)
        response = _safe_response(
            client.post(
                "/api/understanding/analyze",
                headers={**auth, **_idempotency(run_id, case.id, f"understanding-answer-{answer_index}")},
                json={
                    "thread_id": thread_id,
                    "session_id": understanding_session_id,
                    "answer": {"question_id": question_id, "answer_text": case.answer_for(question_id)},
                },
            ),
            200,
            f"answer understanding question {question_id}",
        )
        answer_index += 1

    baseline_understanding = response["understanding"]
    if baseline_understanding is None:
        raise ShadowFlowError("Understanding flow completed without a baseline summary")

    _safe_response(
        client.post(
            f"/api/understanding/{understanding_session_id}/confirm",
            headers={**auth, **_idempotency(run_id, case.id, "understanding-confirm")},
            json={"assessment": "accurate"},
        ),
        200,
        "confirm understanding",
    )
    created_plan = _safe_response(
        client.post(
            "/api/plans",
            headers={**auth, **_idempotency(run_id, case.id, "plan")},
            json={"thread_id": thread_id, "understanding_session_id": understanding_session_id},
        ),
        201,
        "create plan",
    )
    baseline_plan = created_plan["plan"]
    _safe_response(
        client.post(
            f"/api/plans/{baseline_plan['id']}/accept",
            headers={**auth, **_idempotency(run_id, case.id, "plan-accept")},
            json={"expected_version": baseline_plan["version"]},
        ),
        200,
        "accept plan",
    )
    action_result = _safe_response(
        client.post(
            "/api/action-results",
            headers={**auth, **_idempotency(run_id, case.id, "action-result")},
            json={
                "thread_id": thread_id,
                "plan_id": baseline_plan["id"],
                "started": case.started,
                "completed": case.completed,
                "progress_percent": case.progress_percent,
                "actual_duration_minutes": case.actual_duration_minutes,
                "obstacle_code": case.obstacle_code,
                "obstacle_detail": case.obstacle_detail,
            },
        ),
        201,
        "submit action result",
    )
    aggregate = _safe_response(client.get(f"/api/threads/{thread_id}", headers=auth), 200, "reload thread")

    records = _wait_for_evaluations(
        session_factory,
        user_id=user_id,
        thread_id=thread_id,
        wait_seconds=wait_seconds,
    )
    by_type = {record.decision_type: record for record in records}
    evaluations = {decision_type: _evaluation_payload(by_type.get(decision_type)) for decision_type in DECISION_TYPES}
    statuses = [evaluation["status"] for evaluation in evaluations.values()]
    status = (
        "passed"
        if all(value == "passed" for value in statuses)
        else next(value for value in statuses if value != "passed")
    )
    formal_state = _formal_state_counts(session_factory, user_id=user_id, thread_id=thread_id)
    if aggregate["thread"]["current_step"] != "system_revised":
        formal_state["violations"].append(
            f"thread current_step expected system_revised, got {aggregate['thread']['current_step']}"
        )
        formal_state["shadow_isolated"] = False

    return {
        "case_id": case.id,
        "title": case.title,
        "status": status,
        "user_id": user_id,
        "thread_id": thread_id,
        "questions": question_ids,
        "baseline_understanding": evaluations["understanding"]["baseline_output"] or baseline_understanding,
        "candidate_understanding": evaluations["understanding"]["candidate_output"],
        "baseline_plan": evaluations["plan"]["baseline_output"],
        "candidate_plan": evaluations["plan"]["candidate_output"],
        "baseline_action_revision": evaluations["action_revision"]["baseline_output"]
        or action_result["system_revision"],
        "candidate_action_revision": evaluations["action_revision"]["candidate_output"],
        "evaluations": evaluations,
        "formal_state": formal_state,
        "reloaded_step": aggregate["thread"]["current_step"],
        "human_review": {
            "baseline_better": None,
            "candidate_better": None,
            "roughly_equal": None,
            "unsafe_or_unreliable": None,
            "reviewer_notes": "",
        },
    }


def failed_case(case: ShadowCase, error: Exception) -> dict[str, Any]:
    return {
        "case_id": case.id,
        "title": case.title,
        "status": "evaluation_failed",
        "failure_reason": str(error),
        "user_id": None,
        "thread_id": None,
        "baseline_understanding": None,
        "candidate_understanding": None,
        "baseline_plan": None,
        "candidate_plan": None,
        "baseline_action_revision": None,
        "candidate_action_revision": None,
        "evaluations": {decision_type: _evaluation_payload(None) for decision_type in DECISION_TYPES},
        "formal_state": {"violations": [str(error)], "shadow_isolated": False},
        "human_review": {
            "baseline_better": None,
            "candidate_better": None,
            "roughly_equal": None,
            "unsafe_or_unreliable": None,
            "reviewer_notes": "",
        },
    }


def build_report(*, provider: str, model: str, case_results: list[dict[str, Any]]) -> dict[str, Any]:
    evaluations = [
        evaluation
        for case in case_results
        for evaluation in case["evaluations"].values()
        if evaluation.get("provider_error") != "EVALUATION_MISSING"
    ]
    latencies = [evaluation["latency_ms"] for evaluation in evaluations if evaluation["latency_ms"] is not None]
    schema_valid_count = sum(bool(evaluation["schema_valid"]) for evaluation in evaluations)
    provider_error_count = sum(evaluation["provider_error"] is not None for evaluation in evaluations)
    status_counts: dict[str, int] = {}
    for case in case_results:
        status_counts[case["status"]] = status_counts.get(case["status"], 0) + 1
    user_ids = [case["user_id"] for case in case_results if case.get("user_id")]
    thread_ids = [case["thread_id"] for case in case_results if case.get("thread_id")]
    isolation_violations = [
        f"{case['case_id']}: {violation}"
        for case in case_results
        for violation in case["formal_state"].get("violations", [])
    ]
    if len(user_ids) != len(set(user_ids)):
        isolation_violations.append("duplicate user_id detected across cases")
    if len(thread_ids) != len(set(thread_ids)):
        isolation_violations.append("duplicate thread_id detected across cases")

    total_evaluations = len(evaluations)
    return {
        "report_version": "shadow_evaluation_v1",
        "generated_at": datetime.now(UTC).isoformat(),
        "provider": provider,
        "model": model,
        "baseline_provider": "deterministic",
        "candidate_promoted": False,
        "summary": {
            "case_count": len(case_results),
            "evaluation_count": total_evaluations,
            "status_counts": status_counts,
            "schema_valid_count": schema_valid_count,
            "schema_pass_rate": schema_valid_count / total_evaluations if total_evaluations else 0.0,
            "provider_error_count": provider_error_count,
            "provider_error_rate": provider_error_count / total_evaluations if total_evaluations else 0.0,
            "average_latency_ms": round(mean(latencies), 2) if latencies else None,
            "maximum_latency_ms": max(latencies) if latencies else None,
            "isolation_violations": isolation_violations,
            "formal_state_affected": bool(isolation_violations),
            "human_review_completed": False,
        },
        "cases": case_results,
    }


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# XUANOS Real LLM Shadow Evaluation",
        "",
        f"- Generated: `{report['generated_at']}`",
        f"- Provider: `{report['provider']}`",
        f"- Model: `{report['model']}`",
        "- Formal baseline: `deterministic`",
        "- Candidate promoted: `false`",
        "",
        "## Summary",
        "",
        f"- Cases: `{summary['case_count']}`",
        f"- Evaluations: `{summary['evaluation_count']}`",
        f"- Schema pass rate: `{summary['schema_pass_rate']:.2%}`",
        f"- Provider error rate: `{summary['provider_error_rate']:.2%}`",
        f"- Average latency: `{summary['average_latency_ms']} ms`",
        f"- Maximum latency: `{summary['maximum_latency_ms']} ms`",
        f"- Formal-state isolation violations: `{len(summary['isolation_violations'])}`",
        "",
        "Human review fields are intentionally blank. This report does not claim that the candidate is better.",
        "",
        "| Case | Status | Understanding | Plan | Action revision |",
        "|---|---|---|---|---|",
    ]
    for case in report["cases"]:
        statuses = [case["evaluations"][decision]["status"] for decision in DECISION_TYPES]
        lines.append(f"| {case['title']} | {case['status']} | {statuses[0]} | {statuses[1]} | {statuses[2]} |")

    for case in report["cases"]:
        lines.extend(
            [
                "",
                f"## {case['title']}",
                "",
                f"Overall status: `{case['status']}`",
                "",
                "### Human Review",
                "",
                "- [ ] baseline_better",
                "- [ ] candidate_better",
                "- [ ] roughly_equal",
                "- [ ] unsafe_or_unreliable",
                "- reviewer_notes:",
            ]
        )
        for decision_type, baseline_key, candidate_key in (
            ("understanding", "baseline_understanding", "candidate_understanding"),
            ("plan", "baseline_plan", "candidate_plan"),
            ("action_revision", "baseline_action_revision", "candidate_action_revision"),
        ):
            evaluation = case["evaluations"][decision_type]
            lines.extend(
                [
                    "",
                    f"### {decision_type}",
                    "",
                    f"Status: `{evaluation['status']}`; schema_valid: `{evaluation['schema_valid']}`; "
                    f"latency_ms: `{evaluation['latency_ms']}`; provider_error: `{evaluation['provider_error']}`",
                    "",
                    "| Metric | Result |",
                    "|---|---|",
                    f"| goal_alignment | {evaluation['goal_alignment']} |",
                    f"| constraint_adherence | {evaluation['constraint_adherence']} |",
                    f"| factual_grounding | {evaluation['factual_grounding']} |",
                    f"| actionability | {evaluation['actionability']} |",
                    f"| baseline_divergence | {evaluation['baseline_divergence']} |",
                    "| unsupported_assumptions | "
                    f"{json.dumps(evaluation['unsupported_assumptions'], ensure_ascii=False)} |",
                    f"| forbidden_term_hits | {json.dumps(evaluation['forbidden_term_hits'], ensure_ascii=False)} |",
                    "",
                    "Baseline:",
                    "",
                    "```json",
                    json.dumps(case[baseline_key], ensure_ascii=False, indent=2),
                    "```",
                    "",
                    "Candidate:",
                    "",
                    "```json",
                    json.dumps(case[candidate_key], ensure_ascii=False, indent=2),
                    "```",
                ]
            )
    lines.append("")
    return "\n".join(lines)


def report_paths(output: Path | None, selected_cases: list[ShadowCase], invocation_root: Path) -> tuple[Path, Path]:
    if output is None:
        suffix = "all" if len(selected_cases) > 1 else selected_cases[0].id
        output = invocation_root / "reports" / f"shadow-evaluation-{suffix}.json"
    elif not output.is_absolute():
        output = invocation_root / output
    if output.suffix.casefold() == ".json":
        return output, output.with_suffix(".md")
    if output.suffix.casefold() == ".md":
        return output.with_suffix(".json"), output
    raise ShadowFlowError("--output must end in .json or .md")


def write_report(report: dict[str, Any], json_path: Path, markdown_path: Path) -> None:
    json_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")


def _validate_provider_settings(settings: Any) -> None:
    missing: list[str] = []
    if settings.decision_engine_provider.strip().casefold() not in {"openai", "openai_compatible"}:
        missing.append("XUANOS_DECISION_ENGINE_PROVIDER=openai_compatible")
    if not settings.llm_shadow_enabled:
        missing.append("XUANOS_LLM_SHADOW_ENABLED=true")
    if not settings.llm_model:
        missing.append("XUANOS_LLM_MODEL")
    if not settings.llm_base_url:
        missing.append("XUANOS_LLM_BASE_URL")
    if settings.llm_api_key is None or not settings.llm_api_key.get_secret_value():
        missing.append("XUANOS_LLM_API_KEY")
    if missing:
        missing_text = ", ".join(missing)
        raise ShadowFlowError(
            "provider_unavailable: configure backend/.env locally; missing or disabled: " + missing_text
        )


def _migrate_temporary_database() -> None:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    command.upgrade(config, "head")


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    invocation_root = Path.cwd()
    selected_cases = list(CASES.values()) if args.all else [CASES[args.case]]
    run_id = uuid4().hex[:12]

    with tempfile.TemporaryDirectory(prefix="xuanos-real-shadow-") as temp_dir:
        database_path = Path(temp_dir) / "shadow-evaluation.db"
        os.environ["XUANOS_DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

        from app.core.config import get_settings

        get_settings.cache_clear()
        settings = get_settings()
        try:
            _validate_provider_settings(settings)
        except ShadowFlowError as error:
            print(json.dumps({"status": "provider_unavailable", "message": str(error)}, ensure_ascii=False))
            return 2

        _migrate_temporary_database()

        from fastapi.testclient import TestClient

        from app.db.session import SessionLocal, engine
        from app.main import app

        case_results: list[dict[str, Any]] = []
        with TestClient(app) as client:
            for case in selected_cases:
                print(f"[{case.id}] running formal flow and shadow evaluations...", flush=True)
                try:
                    result = run_case(
                        client,
                        SessionLocal,
                        case=case,
                        run_id=run_id,
                        wait_seconds=args.evaluation_wait_seconds,
                    )
                except Exception as error:
                    result = failed_case(case, error)
                case_results.append(result)
                print(f"[{case.id}] {result['status']}", flush=True)

        report = build_report(
            provider=settings.decision_engine_provider.strip().casefold(),
            model=settings.llm_model,
            case_results=case_results,
        )
        json_path, markdown_path = report_paths(args.output, selected_cases, invocation_root)
        write_report(report, json_path, markdown_path)
        engine.dispose()

    print(
        json.dumps(
            {
                "status": "completed",
                "json_report": str(json_path),
                "markdown_report": str(markdown_path),
                "summary": report["summary"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if all(case["status"] == "passed" for case in report["cases"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
