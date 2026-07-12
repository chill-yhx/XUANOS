from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_id


class ActionResult(TimestampMixin, Base):
    __tablename__ = "action_results"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_action_result_idempotency"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(160), nullable=False)
    started: Mapped[bool] = mapped_column(Boolean, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    obstacle_code: Mapped[str] = mapped_column(String(48), nullable=False)
    obstacle_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    energy_change: Mapped[str | None] = mapped_column(Text, nullable=True)
    unrealistic_part: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_judgment: Mapped[str] = mapped_column(Text, nullable=False)
    actual_result_summary: Mapped[str] = mapped_column(Text, nullable=False)
    revised_judgment: Mapped[str] = mapped_column(Text, nullable=False)
    next_adjustment: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
