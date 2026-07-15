import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from scripts.run_shadow_evaluation import (
    CASES,
    DECISION_TYPES,
    build_report,
    evaluation_status,
    report_paths,
    write_report,
)


def evaluation(*, status: str = "passed", latency_ms: int = 100) -> dict:
    provider_error = None if status == "passed" else "PROVIDER_TIMEOUT"
    return {
        "status": status,
        "baseline_output": {"formal": True},
        "candidate_output": {"candidate": True} if status == "passed" else None,
        "schema_valid": status == "passed",
        "latency_ms": latency_ms,
        "provider_error": provider_error,
        "goal_alignment": "pass" if status == "passed" else "unknown",
        "constraint_adherence": "pass" if status == "passed" else "unknown",
        "factual_grounding": "pass" if status == "passed" else "unknown",
        "actionability": "pass" if status == "passed" else "unknown",
        "unsupported_assumptions": [],
        "baseline_divergence": "minor" if status == "passed" else "unknown",
        "forbidden_term_hits": [],
    }


def case_result() -> dict:
    evaluations = {decision: evaluation(latency_ms=100 + index) for index, decision in enumerate(DECISION_TYPES)}
    return {
        "case_id": "ielts",
        "title": "雅思 7.5",
        "status": "passed",
        "user_id": "synthetic-user",
        "thread_id": "synthetic-thread",
        "baseline_understanding": evaluations["understanding"]["baseline_output"],
        "candidate_understanding": evaluations["understanding"]["candidate_output"],
        "baseline_plan": evaluations["plan"]["baseline_output"],
        "candidate_plan": evaluations["plan"]["candidate_output"],
        "baseline_action_revision": evaluations["action_revision"]["baseline_output"],
        "candidate_action_revision": evaluations["action_revision"]["candidate_output"],
        "evaluations": evaluations,
        "formal_state": {"violations": [], "shadow_isolated": True},
        "human_review": {
            "baseline_better": None,
            "candidate_better": None,
            "roughly_equal": None,
            "unsafe_or_unreliable": None,
            "reviewer_notes": "",
        },
    }


def test_runner_defines_all_twelve_required_cases() -> None:
    assert list(CASES) == [
        "ielts",
        "python",
        "fitness",
        "cooking",
        "math",
        "liuyao",
        "multi-goal",
        "twenty-minutes",
        "vague-goal",
        "unrealistic-goal",
        "insufficient-info",
        "xuanos",
    ]


def test_evaluation_status_distinguishes_required_failure_classes() -> None:
    assert evaluation_status(True, None) == "passed"
    assert evaluation_status(False, "PROVIDER_UNAVAILABLE") == "provider_unavailable"
    assert evaluation_status(False, "PROVIDER_TIMEOUT") == "timeout"
    assert evaluation_status(False, "PROVIDER_TRANSPORT_ERROR") == "transport_error"
    assert evaluation_status(False, "PROVIDER_AUTH_ERROR") == "transport_error"
    assert evaluation_status(False, "PROVIDER_PAYMENT_REQUIRED") == "transport_error"
    assert evaluation_status(False, "PROVIDER_RATE_LIMITED") == "transport_error"
    assert evaluation_status(False, "CANDIDATE_INVALID_JSON") == "invalid_json"
    assert evaluation_status(False, "CANDIDATE_SCHEMA_INVALID") == "schema_invalid"
    assert evaluation_status(False, "EVALUATION_FAILED") == "evaluation_failed"


def test_report_contains_comparison_metrics_and_blank_human_review_without_secrets(tmp_path: Path) -> None:
    report = build_report(provider="openai_compatible", model="configured-model", case_results=[case_result()])
    json_path, markdown_path = report_paths(tmp_path / "shadow.json", [CASES["ielts"]], tmp_path)

    write_report(report, json_path, markdown_path)

    payload = json.loads(json_path.read_text(encoding="utf-8"))
    markdown = markdown_path.read_text(encoding="utf-8")
    assert payload["candidate_promoted"] is False
    assert payload["summary"]["schema_pass_rate"] == 1
    assert payload["summary"]["provider_error_rate"] == 0
    assert payload["summary"]["average_latency_ms"] == 101
    assert payload["cases"][0]["human_review"]["candidate_better"] is None
    assert "- [ ] candidate_better" in markdown
    assert "XUANOS_LLM_API_KEY" not in json_path.read_text(encoding="utf-8")
    assert "local-test-secret" not in markdown


class OpenAICompatibleHandler(BaseHTTPRequestHandler):
    calls = 0

    def do_POST(self) -> None:  # noqa: N802
        content_length = int(self.headers["Content-Length"])
        request = json.loads(self.rfile.read(content_length))
        prompt = json.loads(request["messages"][-1]["content"])
        candidate = self._candidate(prompt)
        payload = json.dumps(
            {"choices": [{"message": {"content": json.dumps(candidate, ensure_ascii=False)}}]},
            ensure_ascii=False,
        ).encode()
        type(self).calls += 1
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format: str, *args: object) -> None:
        return None

    @staticmethod
    def _candidate(prompt: dict[str, Any]) -> dict[str, Any]:
        context = prompt["context"]
        schema_title = prompt["required_output_schema"]["title"]
        answers = {item["question_id"]: item["answer_text"] for item in context["answers"]}
        goal = (context.get("confirmed_understanding") or {}).get("real_goal") or context["original_expression"]
        constraints = (context.get("confirmed_understanding") or {}).get("constraints") or answers.get(
            "real_constraints", "现实限制待确认"
        )
        if schema_title == "UnderstandingCandidate":
            return {
                "real_goal": goal,
                "foundation": answers.get("current_foundation", "当前基础待确认"),
                "constraints": constraints,
                "tension": f"需要在{constraints}内推进目标。",
                "uncertain": "首轮行动的实际阻力仍待验证。",
                "unknown_information": [],
            }
        if schema_title == "PlanCandidate":
            return {
                "stage": "首轮验证",
                "summary": f"围绕{goal}安排受现实限制约束的首轮行动。",
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
            }
        feedback = context["action_feedback"]
        return {
            "actual_result": f"已记录 {feedback['progress_percent']}% 的行动结果。",
            "revised_judgment": f"需要根据 {feedback['obstacle_code']} 继续调整范围。",
            "next_adjustment": f"为{goal}安排一次更小、更明确的下一步行动。",
            "next_stage": "行动复查",
            "pattern": "首轮反馈只形成待验证的行动规律。",
            "hypothesis_status": "pending",
            "unknown_information": [],
        }


def test_cli_runs_all_formal_flows_through_openai_compatible_transport(tmp_path: Path) -> None:
    OpenAICompatibleHandler.calls = 0
    server = ThreadingHTTPServer(("127.0.0.1", 0), OpenAICompatibleHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    output_path = tmp_path / "real-shadow.json"
    secret = "subprocess-only-test-secret"
    environment = {
        **os.environ,
        "XUANOS_DECISION_ENGINE_PROVIDER": "openai_compatible",
        "XUANOS_LLM_SHADOW_ENABLED": "true",
        "XUANOS_LLM_MODEL": "local-openai-compatible-test-model",
        "XUANOS_LLM_BASE_URL": f"http://127.0.0.1:{server.server_port}/v1",
        "XUANOS_LLM_API_KEY": secret,
        "XUANOS_LLM_TIMEOUT_SECONDS": "5",
    }
    try:
        completed = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).resolve().parents[1] / "scripts" / "run_shadow_evaluation.py"),
                "--all",
                "--output",
                str(output_path),
            ],
            cwd=Path(__file__).resolve().parents[2],
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
            check=False,
        )
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert completed.returncode == 0, completed.stderr or completed.stdout
    assert OpenAICompatibleHandler.calls == 36
    report = json.loads(output_path.read_text(encoding="utf-8"))
    assert report["summary"]["case_count"] == 12
    assert report["summary"]["evaluation_count"] == 36
    assert report["summary"]["schema_pass_rate"] == 1
    assert report["summary"]["provider_error_rate"] == 0
    assert report["summary"]["formal_state_affected"] is False
    assert all(case["status"] == "passed" for case in report["cases"])
    assert all(case["reloaded_step"] == "system_revised" for case in report["cases"])
    assert len({case["user_id"] for case in report["cases"]}) == 12
    assert len({case["thread_id"] for case in report["cases"]}) == 12
    assert secret not in completed.stdout
    assert secret not in completed.stderr
    assert secret not in output_path.read_text(encoding="utf-8")
