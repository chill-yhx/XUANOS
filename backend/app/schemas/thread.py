from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.action_result import ActionResultRead
from app.schemas.plan import PlanRead
from app.schemas.snapshot import SnapshotRead
from app.schemas.understanding import AnswerRead, CorrectionRead, UnderstandingSessionRead, UnderstandingSummaryRead


class ThreadCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    title: str
    status: str
    current_step: str
    phase: str
    active_understanding_session_id: str | None
    active_plan_id: str | None
    last_activity_at: datetime
    created_at: datetime
    updated_at: datetime


class ThreadAggregate(BaseModel):
    thread: ThreadRead
    active_understanding_session: UnderstandingSessionRead | None = None
    current_answers: list[AnswerRead] = Field(default_factory=list)
    understanding_summary: UnderstandingSummaryRead | None = None
    recent_corrections: list[CorrectionRead] = Field(default_factory=list)
    current_plan: PlanRead | None = None
    plan_versions: list[PlanRead] = Field(default_factory=list)
    latest_action_result: ActionResultRead | None = None
    current_snapshot: SnapshotRead
