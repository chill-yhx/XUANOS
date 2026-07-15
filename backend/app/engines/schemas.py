from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from app.engines.context import DecisionContext


DecisionType = Literal["understanding", "plan", "action_revision"]


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


@dataclass(frozen=True)
class ShadowEvaluationIntent:
    decision_type: DecisionType
    user_id: str
    thread_id: str
    context: "DecisionContext"
    baseline_output: dict[str, Any]


CandidateText = Annotated[str, Field(min_length=1, max_length=1600)]
CandidateShortText = Annotated[str, Field(min_length=1, max_length=320)]


class CandidateDecisionBase(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    unknown_information: list[CandidateShortText] = Field(default_factory=list, max_length=10)


class UnderstandingCandidate(CandidateDecisionBase):
    real_goal: CandidateText
    foundation: CandidateText
    constraints: CandidateText
    tension: CandidateText
    uncertain: CandidateText


class PlanItemCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    item_type: Literal["action", "maintenance", "paused", "deleted"]
    title: CandidateText
    sort_order: int = Field(ge=1, le=10)
    estimated_minutes: int | None = Field(default=None, ge=1, le=1440)
    completion_standard: CandidateText | None = None


class PlanCandidate(CandidateDecisionBase):
    stage: CandidateShortText
    summary: CandidateText
    single_action: CandidateText
    completion_standard: CandidateText
    review_condition: CandidateText
    workload: Literal["low", "medium", "high"]
    system_recommendation: CandidateText
    items: list[PlanItemCandidate] = Field(min_length=1, max_length=5)
    maintenance_goals: list[CandidateShortText] = Field(default_factory=list, max_length=5)
    paused_goals: list[CandidateShortText] = Field(default_factory=list, max_length=5)
    deleted_items: list[CandidateShortText] = Field(default_factory=list, max_length=5)


class ActionRevisionCandidate(CandidateDecisionBase):
    actual_result: CandidateText
    revised_judgment: CandidateText
    next_adjustment: CandidateText
    next_stage: CandidateShortText
    pattern: CandidateText
    hypothesis_status: Literal["pending", "verified", "denied"]


def candidate_schema_for(decision_type: DecisionType) -> type[CandidateDecisionBase]:
    return {
        "understanding": UnderstandingCandidate,
        "plan": PlanCandidate,
        "action_revision": ActionRevisionCandidate,
    }[decision_type]


def baseline_output_for(
    decision_type: DecisionType,
    decision: UnderstandingDecision | PlanDecision | ActionRevisionDecision,
    context: "DecisionContext",
) -> dict[str, Any]:
    output = asdict(decision)
    output["unknown_information"] = list(context.unknown_information)
    if decision_type == "plan":
        output.update(
            {
                "maintenance_goals": [],
                "paused_goals": [],
                "deleted_items": [],
            }
        )
    return output
