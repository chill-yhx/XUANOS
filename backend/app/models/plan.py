from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_id


class Plan(TimestampMixin, Base):
    __tablename__ = "plans"
    __table_args__ = (UniqueConstraint("root_plan_id", "version", name="uq_plan_root_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    root_plan_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    previous_plan_id: Mapped[str | None] = mapped_column(ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    understanding_session_id: Mapped[str] = mapped_column(
        ForeignKey("understanding_sessions.id", ondelete="RESTRICT"), nullable=False
    )
    primary_goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="generated", index=True)
    stage: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    single_action: Mapped[str] = mapped_column(Text, nullable=False)
    completion_standard: Mapped[str] = mapped_column(Text, nullable=False)
    review_condition: Mapped[str] = mapped_column(Text, nullable=False)
    workload: Mapped[str] = mapped_column(String(24), nullable=False, default="medium")
    system_recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    is_user_final_choice: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_final_choice: Mapped[str | None] = mapped_column(Text, nullable=True)
    modification_reason: Mapped[str | None] = mapped_column(String(48), nullable=True)
    expected_impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    warning_level: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PlanItem(TimestampMixin, Base):
    __tablename__ = "plan_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True)
    goal_id: Mapped[str | None] = mapped_column(ForeignKey("goals.id", ondelete="SET NULL"), nullable=True)
    item_type: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    time_block: Mapped[str | None] = mapped_column(String(32), nullable=True)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_standard: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_optional: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="system")
    is_user_modified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    modification_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
