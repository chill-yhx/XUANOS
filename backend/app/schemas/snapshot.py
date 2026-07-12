from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class SnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    version: int
    source_thread_id: str | None
    source_action_result_id: str | None
    current_vector: str
    current_stage: str
    current_action: str
    reality_boundaries: list[str]
    effective_patterns: list[dict[str, Any]]
    hypotheses: list[dict[str, Any]]
    recent_revisions: list[str]
    user_corrections: list[str]
    revision_count: int
    created_at: datetime
    updated_at: datetime
