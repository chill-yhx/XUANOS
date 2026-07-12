from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_id


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    understanding_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("understanding_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    original_expression: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    desired_outcome: Mapped[str] = mapped_column(Text, nullable=False)
    success_criteria: Mapped[str] = mapped_column(Text, nullable=False)
    goal_type: Mapped[str] = mapped_column(String(32), nullable=False, default="project")
    priority: Mapped[str] = mapped_column(String(24), nullable=False, default="primary")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    current_stage: Mapped[str | None] = mapped_column(String(160), nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    estimated_load: Mapped[str | None] = mapped_column(String(24), nullable=True)
    feasibility: Mapped[str | None] = mapped_column(String(24), nullable=True)
    feasibility_basis: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Constraint(TimestampMixin, Base):
    __tablename__ = "constraints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    goal_id: Mapped[str | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    constraint_type: Mapped[str] = mapped_column(String(32), nullable=False, default="fixed")
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="user_confirmed")
    is_hard: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    user_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
