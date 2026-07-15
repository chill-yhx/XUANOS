from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.engines.context import DecisionContext
from app.engines.schemas import DecisionType

FORBIDDEN_DEVELOPMENT_TERMS = (
    "后端核心闭环",
    "完成五个页面的后端状态接线",
    "每周 3 次基础健身",
    "Flutter 客户端",
    "完整商业系统",
    "新增 MVP 范围外功能",
)

_GENERIC_GOAL_FRAGMENTS = {
    "完成",
    "目标",
    "当前",
    "行动",
    "计划",
    "系统",
    "一个",
    "需要",
    "提升",
    "建立",
    "实现",
}
_DETERMINISTIC_ASSERTIONS = ("一定", "必然", "肯定", "保证")
_HYPOTHESIS_QUALIFIERS = ("假设", "待验证", "可能", "尚未确定", "不确定")


@dataclass(frozen=True)
class CandidateEvaluation:
    goal_alignment: str
    constraint_adherence: str
    factual_grounding: str
    actionability: str
    unsupported_assumptions: list[str]
    baseline_divergence: str
    forbidden_term_hits: list[str]


def evaluate_candidate(
    *,
    decision_type: DecisionType,
    context: DecisionContext,
    baseline_output: dict[str, Any],
    candidate_output: dict[str, Any],
) -> CandidateEvaluation:
    candidate_text = _flatten_text(candidate_output)
    baseline_text = _flatten_text(baseline_output)
    goal = context.primary_goal()
    forbidden_hits = [term for term in FORBIDDEN_DEVELOPMENT_TERMS if term in candidate_text]
    unsupported = _unsupported_assumptions(context, candidate_output, candidate_text, forbidden_hits)
    return CandidateEvaluation(
        goal_alignment="pass" if _has_goal_alignment(goal, candidate_text) else "fail",
        constraint_adherence=_constraint_adherence(context, candidate_output, candidate_text),
        factual_grounding="pass" if not unsupported else "fail",
        actionability=_actionability(decision_type, candidate_output),
        unsupported_assumptions=unsupported,
        baseline_divergence=_baseline_divergence(goal, baseline_text, candidate_text),
        forbidden_term_hits=forbidden_hits,
    )


def _unsupported_assumptions(
    context: DecisionContext,
    candidate: dict[str, Any],
    candidate_text: str,
    forbidden_hits: list[str],
) -> list[str]:
    unsupported: list[str] = []
    evidence_text = _flatten_text({"facts": context.user_facts, "claims": context.user_claims})
    for key in ("maintenance_goals", "paused_goals", "deleted_items"):
        for value in candidate.get(key, []):
            if str(value) not in evidence_text:
                unsupported.append(f"{key}:{value}")
    for hypothesis in context.system_hypotheses:
        content = str(hypothesis["content"])
        if (
            hypothesis.get("status") != "verified"
            and content in candidate_text
            and not any(marker in candidate_text for marker in _HYPOTHESIS_QUALIFIERS)
        ):
            unsupported.append(f"hypothesis_presented_as_fact:{content}")
    for assertion in _DETERMINISTIC_ASSERTIONS:
        if assertion in candidate_text:
            unsupported.append(f"unsupported_deterministic_assertion:{assertion}")
    unsupported.extend(f"forbidden_term:{term}" for term in forbidden_hits)
    return list(dict.fromkeys(unsupported))


def _constraint_adherence(context: DecisionContext, candidate: dict[str, Any], candidate_text: str) -> str:
    limits = _minutes_in(context.constraints_text())
    if not limits:
        return "unknown"
    candidate_minutes = [
        int(item["estimated_minutes"])
        for item in candidate.get("items", [])
        if isinstance(item, dict) and item.get("estimated_minutes") is not None
    ]
    if not candidate_minutes:
        candidate_minutes = _minutes_in(candidate_text)
    if not candidate_minutes:
        return "unknown"
    return "pass" if max(candidate_minutes) <= min(limits) else "fail"


def _actionability(decision_type: DecisionType, candidate: dict[str, Any]) -> str:
    if decision_type == "understanding":
        values = (candidate.get("real_goal"), candidate.get("foundation"), candidate.get("constraints"))
    elif decision_type == "plan":
        values = (candidate.get("single_action"), candidate.get("completion_standard"))
    else:
        values = (candidate.get("next_adjustment"), candidate.get("revised_judgment"))
    return "pass" if all(isinstance(value, str) and len(value.strip()) >= 6 for value in values) else "fail"


def _baseline_divergence(goal: str, baseline_text: str, candidate_text: str) -> str:
    if _normalize(baseline_text) == _normalize(candidate_text):
        return "none"
    if _has_goal_alignment(goal, candidate_text) and _shared_signal(baseline_text, candidate_text):
        return "minor"
    return "major"


def _has_goal_alignment(goal: str, candidate_text: str) -> bool:
    normalized_goal = _normalize(goal)
    normalized_candidate = _normalize(candidate_text)
    if not normalized_goal or not normalized_candidate:
        return False
    if normalized_goal in normalized_candidate:
        return True
    return any(fragment in normalized_candidate for fragment in _goal_fragments(normalized_goal))


def _shared_signal(left: str, right: str) -> bool:
    return bool(set(_goal_fragments(_normalize(left))) & set(_goal_fragments(_normalize(right))))


def _goal_fragments(value: str) -> list[str]:
    ascii_words = re.findall(r"[a-z0-9]{2,}", value.casefold())
    chinese_chunks = re.findall(r"[\u4e00-\u9fff]+", value)
    fragments = [word for word in ascii_words if word not in _GENERIC_GOAL_FRAGMENTS]
    for chunk in chinese_chunks:
        for size in (4, 3, 2):
            fragments.extend(
                chunk[index : index + size]
                for index in range(max(0, len(chunk) - size + 1))
                if chunk[index : index + size] not in _GENERIC_GOAL_FRAGMENTS
            )
    return list(dict.fromkeys(fragment for fragment in fragments if len(fragment) >= 2))


def _minutes_in(value: str) -> list[int]:
    matches = re.findall(r"(\d+(?:\.\d+)?)\s*(小时|时|分钟|min)", value, flags=re.IGNORECASE)
    return [
        round(float(amount) * 60) if unit.casefold() in {"小时", "时"} else round(float(amount))
        for amount, unit in matches
    ]


def _flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_flatten_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value)
    return ""


def _normalize(value: str) -> str:
    return "".join(value.casefold().split())
