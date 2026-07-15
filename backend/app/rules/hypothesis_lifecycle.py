import hashlib

from app.models.hypothesis import Hypothesis

ACTIVE_HYPOTHESIS_STATUSES = frozenset({"pending", "verified"})
TERMINAL_HYPOTHESIS_STATUSES = frozenset({"denied", "discontinued", "expired", "superseded"})
REPLACEMENT_CORRECTION_TYPES = frozenset({"partial", "inaccurate", "changed"})
GOAL_FEASIBILITY_CATEGORY = "goal_feasibility"


def goal_feasibility_content(goal: str) -> str:
    """Create a stable, thread-specific hypothesis from a confirmed goal."""

    normalized_goal = " ".join(goal.strip().split())[:240] or "当前目标"
    return f"“{normalized_goal}”可以通过一次小范围行动验证可执行性。"


def normalize_hypothesis_content(content: str) -> str:
    return " ".join(content.casefold().split())


def hypothesis_semantic_key(category: str, content: str) -> str:
    normalized = f"{category.strip().casefold()}\0{normalize_hypothesis_content(content)}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def is_terminal_hypothesis(hypothesis: Hypothesis) -> bool:
    return hypothesis.status in TERMINAL_HYPOTHESIS_STATUSES or hypothesis.user_attitude == "rejected"


def is_active_hypothesis(hypothesis: Hypothesis) -> bool:
    return hypothesis.status in ACTIVE_HYPOTHESIS_STATUSES and hypothesis.user_attitude != "rejected"
