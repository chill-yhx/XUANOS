from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.snapshot import SnapshotRead


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
    active_understanding_session: None = None
    current_answers: list[object] = []
    understanding_summary: None = None
    recent_corrections: list[object] = []
    current_plan: None = None
    plan_versions: list[object] = []
    latest_action_result: None = None
    current_snapshot: SnapshotRead
