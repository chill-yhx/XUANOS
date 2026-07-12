from typing import Literal

from pydantic import BaseModel

from app.schemas.snapshot import SnapshotRead


class DemoResetRequest(BaseModel):
    confirm: Literal[True]


class DemoResetResult(BaseModel):
    user_id: Literal["demo-user"]
    current_step: Literal["idle"]
    snapshot: SnapshotRead
