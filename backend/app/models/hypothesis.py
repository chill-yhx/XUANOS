from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_id


class Hypothesis(TimestampMixin, Base):
    __tablename__ = "hypotheses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="pending", index=True)
    confidence_internal: Mapped[float | None] = mapped_column(Float, nullable=True)
    supporting_evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    opposing_evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    requires_confirmation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    user_attitude: Mapped[str | None] = mapped_column(String(24), nullable=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
