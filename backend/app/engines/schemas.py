from dataclasses import dataclass


@dataclass(frozen=True)
class DecisionQuestion:
    id: str
    prompt: str
    hint: str


@dataclass(frozen=True)
class UnderstandingDecision:
    real_goal: str
    foundation: str
    constraints: str
    tension: str
    uncertain: str


@dataclass(frozen=True)
class PlanItemDecision:
    item_type: str
    title: str
    sort_order: int
    time_block: str | None = None
    estimated_minutes: int | None = None
    difficulty: int | None = None
    completion_standard: str | None = None
    is_optional: bool = False
    source: str = "system"
    is_user_modified: bool = False
    modification_note: str | None = None


@dataclass(frozen=True)
class PlanDecision:
    stage: str
    summary: str
    single_action: str
    completion_standard: str
    review_condition: str
    workload: str
    system_recommendation: str
    items: tuple[PlanItemDecision, ...]


@dataclass(frozen=True)
class PlanModificationDecision:
    expected_impact: str
    warning_level: str


@dataclass(frozen=True)
class ActionFeedbackContext:
    goal: str
    action: str
    started: bool
    completed: bool
    progress_percent: int
    actual_duration_minutes: int | None
    obstacle_code: str


@dataclass(frozen=True)
class ActionRevisionDecision:
    actual_result: str
    revised_judgment: str
    next_adjustment: str
    next_stage: str
    pattern: str
    hypothesis_status: str
