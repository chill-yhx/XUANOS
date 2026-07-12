from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.snapshot import SnapshotRead


class ActionResultCreate(BaseModel):
    thread_id: str
    plan_id: str
    started: bool
    completed: bool
    progress_percent: int = Field(ge=0, le=100)
    actual_duration_minutes: int | None = Field(default=None, ge=0, le=10080)
    obstacle_code: str = Field(min_length=1, max_length=48)
    obstacle_detail: str | None = Field(default=None, max_length=4000)
    energy_change: str | None = Field(default=None, max_length=4000)
    unrealistic_part: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_result(self) -> "ActionResultCreate":
        if self.completed and self.progress_percent != 100:
            raise ValueError("completed=true 时 progress_percent 必须为 100")
        if not self.started and (self.completed or self.progress_percent != 0):
            raise ValueError("未开始时不能标记完成，progress_percent 必须为 0")
        return self


class ActionResultRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    thread_id: str
    plan_id: str
    started: bool
    completed: bool
    progress_percent: int
    actual_duration_minutes: int | None
    obstacle_code: str
    obstacle_detail: str | None
    energy_change: str | None
    unrealistic_part: str | None
    original_judgment: str
    actual_result_summary: str
    revised_judgment: str
    next_adjustment: str
    submitted_at: datetime
    created_at: datetime
    updated_at: datetime


class SystemRevisionRead(BaseModel):
    original_judgment: str
    actual_result: str
    revised_judgment: str
    next_adjustment: str


class HypothesisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    content: str
    category: str
    status: str
    supporting_evidence: list[dict]
    opposing_evidence: list[dict]
    last_reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ActionSubmissionResult(BaseModel):
    action_result: ActionResultRead
    system_revision: SystemRevisionRead
    hypothesis: HypothesisRead
    snapshot: SnapshotRead
    current_step: str
