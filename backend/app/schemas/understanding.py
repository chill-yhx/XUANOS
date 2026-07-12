from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.snapshot import SnapshotRead

ExpressionMode = Literal["speak", "ask", "sort"]
QuestionId = Literal["desired_result", "current_foundation", "real_constraints"]
Assessment = Literal["accurate", "partial", "inaccurate", "supplement"]


class AnswerInput(BaseModel):
    question_id: QuestionId
    answer_text: str = Field(min_length=1, max_length=4000)


class UnderstandingAnalyzeRequest(BaseModel):
    thread_id: str
    session_id: str | None = None
    expression_mode: ExpressionMode | None = None
    user_input: str | None = Field(default=None, max_length=10000)
    answer: AnswerInput | None = None


class QuestionRead(BaseModel):
    id: QuestionId
    prompt: str
    hint: str
    index: int
    total: int


class AnswerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question_id: str
    question_text: str
    question_order: int
    answer_text: str
    revision: int
    is_current: bool
    answered_at: datetime
    created_at: datetime
    updated_at: datetime


class UnderstandingSummaryRead(BaseModel):
    real_goal: str
    foundation: str
    constraints: str
    tension: str
    uncertain: str


class UnderstandingSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    thread_id: str
    user_id: str
    previous_session_id: str | None
    expression_mode: str
    status: str
    user_input: str | None
    current_question_index: int
    summary_version: int
    confirmed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UnderstandingAnalyzeResult(BaseModel):
    session: UnderstandingSessionRead
    current_answers: list[AnswerRead]
    next_question: QuestionRead | None
    understanding: UnderstandingSummaryRead | None
    current_step: str


class UnderstandingConfirmRequest(BaseModel):
    assessment: Assessment
    correction: str | None = Field(default=None, max_length=5000)


class CorrectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    target_type: str
    target_id: str | None
    assessment: str
    previous_value: str
    user_value: str
    reason: str | None
    system_handling: str | None
    has_conflict: bool
    created_at: datetime
    updated_at: datetime


class UnderstandingConfirmResult(BaseModel):
    session: UnderstandingSessionRead
    understanding: UnderstandingSummaryRead
    correction: CorrectionRead | None
    snapshot: SnapshotRead | None
    current_step: str
