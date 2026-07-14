from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.snapshot import SnapshotRead

ModificationReason = Literal[
    "time_conflict",
    "resource_limit",
    "ability_limit",
    "health_or_safety",
    "personal_preference",
    "reject_system_judgment",
    "other",
]


class PlanCreateRequest(BaseModel):
    thread_id: str
    understanding_session_id: str


class PlanReviseRequest(BaseModel):
    reason: ModificationReason
    user_final_choice: str = Field(min_length=1, max_length=4000)
    expected_impact_acknowledged: bool
    expected_version: int = Field(ge=1)


class PlanAcceptRequest(BaseModel):
    expected_version: int = Field(ge=1)


class PlanItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_type: str
    title: str
    time_block: str | None
    estimated_minutes: int | None
    difficulty: int | None
    completion_standard: str | None
    is_optional: bool
    source: str
    is_user_modified: bool
    modification_note: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    root_plan_id: str
    previous_plan_id: str | None
    thread_id: str
    user_id: str
    understanding_session_id: str
    primary_goal_id: str
    version: int
    status: str
    stage: str
    summary: str
    single_action: str
    completion_standard: str
    review_condition: str
    workload: str
    system_recommendation: str
    is_user_final_choice: bool
    user_final_choice: str | None
    modification_reason: str | None
    expected_impact: str | None
    warning_level: str
    accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[PlanItemRead] = Field(default_factory=list)


class PlanCreateResult(BaseModel):
    plan: PlanRead
    current_step: Literal["plan_generated"]


class PlanReviseResult(BaseModel):
    previous_plan: PlanRead
    current_plan: PlanRead
    current_step: Literal["plan_modified"]


class PlanAcceptResult(BaseModel):
    plan: PlanRead
    snapshot: SnapshotRead
    current_step: Literal["plan_accepted", "action_pending", "feedback_submitted", "system_revised"]
