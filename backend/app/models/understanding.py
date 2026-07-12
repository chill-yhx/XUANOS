from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_id


class UnderstandingSession(TimestampMixin, Base):
    __tablename__ = "understanding_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("understanding_sessions.id", ondelete="SET NULL"), nullable=True
    )
    expression_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="collecting", index=True)
    user_input: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_question_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    real_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    foundation: Mapped[str | None] = mapped_column(Text, nullable=True)
    constraints_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    tension: Mapped[str | None] = mapped_column(Text, nullable=True)
    uncertain: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Answer(TimestampMixin, Base):
    __tablename__ = "answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    understanding_session_id: Mapped[str] = mapped_column(
        ForeignKey("understanding_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    question_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_order: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    supersedes_answer_id: Mapped[str | None] = mapped_column(ForeignKey("answers.id", ondelete="SET NULL"))
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserCorrection(TimestampMixin, Base):
    __tablename__ = "user_corrections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id: Mapped[str | None] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), nullable=True, index=True
    )
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    assessment: Mapped[str] = mapped_column(String(32), nullable=False)
    previous_value: Mapped[str] = mapped_column(Text, nullable=False)
    user_value: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_handling: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_conflict: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
