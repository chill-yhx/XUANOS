from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.snapshot import SnapshotRead

CorrectionTargetType = Literal[
    "understanding",
    "goal",
    "constraint",
    "plan",
    "snapshot",
    "hypothesis",
    "system_section",
]
CorrectionType = Literal["accurate", "partial", "inaccurate", "changed", "discontinue"]


class UserCorrectionCreate(BaseModel):
    expected_snapshot_id: str = Field(min_length=36, max_length=36)
    target_type: CorrectionTargetType
    target_id: str = Field(min_length=1, max_length=36)
    correction_type: CorrectionType
    original_value: str = Field(min_length=1, max_length=10000)
    corrected_value: str = Field(min_length=1, max_length=10000)
    reason: str = Field(min_length=1, max_length=5000)


class UserCorrectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    user_id: str
    thread_id: str | None
    target_type: str
    target_id: str | None
    correction_type: CorrectionType = Field(validation_alias="assessment")
    original_value: str = Field(validation_alias="previous_value")
    corrected_value: str = Field(validation_alias="user_value")
    reason: str | None
    system_handling: str | None
    has_conflict: bool
    created_at: datetime
    updated_at: datetime


class UserCorrectionResult(BaseModel):
    correction: UserCorrectionRead
    snapshot: SnapshotRead
    snapshot_updated: bool
