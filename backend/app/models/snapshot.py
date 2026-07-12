from typing import TYPE_CHECKING, Any
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class UserSnapshot(TimestampMixin, Base):
    __tablename__ = "user_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "version", name="uq_user_snapshot_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    source_thread_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_action_result_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    current_vector: Mapped[str] = mapped_column(Text, nullable=False)
    current_stage: Mapped[str] = mapped_column(String(160), nullable=False)
    current_action: Mapped[str] = mapped_column(Text, nullable=False)
    reality_boundaries: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    effective_patterns: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    hypotheses: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    recent_revisions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    user_corrections: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    revision_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    user: Mapped["User"] = relationship(back_populates="snapshots")
