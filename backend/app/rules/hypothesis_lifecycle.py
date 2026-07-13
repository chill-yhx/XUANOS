import hashlib

from app.models.hypothesis import Hypothesis

ACTIVE_HYPOTHESIS_STATUSES = frozenset({"pending", "verified"})
TERMINAL_HYPOTHESIS_STATUSES = frozenset({"denied", "discontinued", "expired", "superseded"})
REPLACEMENT_CORRECTION_TYPES = frozenset({"partial", "inaccurate", "changed"})
EXECUTION_AVOIDANCE_CATEGORY = "execution_avoidance"
EXECUTION_AVOIDANCE_CONTENT = "用户可能通过继续完善文档推迟真实开发"


def normalize_hypothesis_content(content: str) -> str:
    return " ".join(content.casefold().split())


def hypothesis_semantic_key(category: str, content: str) -> str:
    normalized = f"{category.strip().casefold()}\0{normalize_hypothesis_content(content)}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def is_terminal_hypothesis(hypothesis: Hypothesis) -> bool:
    return hypothesis.status in TERMINAL_HYPOTHESIS_STATUSES or hypothesis.user_attitude == "rejected"


def is_active_hypothesis(hypothesis: Hypothesis) -> bool:
    return hypothesis.status in ACTIVE_HYPOTHESIS_STATUSES and hypothesis.user_attitude != "rejected"
