from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_id


class ShadowEvaluation(TimestampMixin, Base):
    """An isolated comparison between a formal baseline and an LLM candidate."""

    __tablename__ = "shadow_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True)
    decision_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str | None] = mapped_column("model", String(160), nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    context_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    baseline_output: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    candidate_output: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    schema_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_error: Mapped[str | None] = mapped_column(String(64), nullable=True)
    goal_alignment: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    constraint_adherence: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    factual_grounding: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    actionability: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    unsupported_assumptions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    baseline_divergence: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    forbidden_term_hits: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
