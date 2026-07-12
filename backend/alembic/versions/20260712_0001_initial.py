"""Create first-batch backend tables.

Revision ID: 20260712_0001
Revises:
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260712_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("student_stage", sa.String(length=32), nullable=True),
        sa.Column("consent_version", sa.String(length=32), nullable=False),
        sa.Column("current_snapshot_id", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "threads",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("current_step", sa.String(length=48), nullable=False),
        sa.Column("phase", sa.String(length=120), nullable=False),
        sa.Column("active_understanding_session_id", sa.String(length=36), nullable=True),
        sa.Column("active_plan_id", sa.String(length=36), nullable=True),
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_threads_last_activity_at"), "threads", ["last_activity_at"], unique=False)
    op.create_index(op.f("ix_threads_status"), "threads", ["status"], unique=False)
    op.create_index(op.f("ix_threads_user_id"), "threads", ["user_id"], unique=False)

    op.create_table(
        "user_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source_thread_id", sa.String(length=36), nullable=True),
        sa.Column("source_action_result_id", sa.String(length=36), nullable=True),
        sa.Column("current_vector", sa.Text(), nullable=False),
        sa.Column("current_stage", sa.String(length=160), nullable=False),
        sa.Column("current_action", sa.Text(), nullable=False),
        sa.Column("reality_boundaries", sa.JSON(), nullable=False),
        sa.Column("effective_patterns", sa.JSON(), nullable=False),
        sa.Column("hypotheses", sa.JSON(), nullable=False),
        sa.Column("recent_revisions", sa.JSON(), nullable=False),
        sa.Column("user_corrections", sa.JSON(), nullable=False),
        sa.Column("revision_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "version", name="uq_user_snapshot_version"),
    )
    op.create_index(op.f("ix_user_snapshots_user_id"), "user_snapshots", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_snapshots_user_id"), table_name="user_snapshots")
    op.drop_table("user_snapshots")
    op.drop_index(op.f("ix_threads_user_id"), table_name="threads")
    op.drop_index(op.f("ix_threads_status"), table_name="threads")
    op.drop_index(op.f("ix_threads_last_activity_at"), table_name="threads")
    op.drop_table("threads")
    op.drop_table("users")
