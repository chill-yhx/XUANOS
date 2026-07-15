"""Add isolated LLM shadow evaluation records.

Revision ID: 20260715_0006
Revises: 20260714_0005
Create Date: 2026-07-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260715_0006"
down_revision: str | None = "20260714_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "shadow_evaluations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("decision_type", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=160), nullable=True),
        sa.Column("prompt_version", sa.String(length=64), nullable=False),
        sa.Column("context_hash", sa.String(length=64), nullable=False),
        sa.Column("baseline_output", sa.JSON(), nullable=False),
        sa.Column("candidate_output", sa.JSON(), nullable=True),
        sa.Column("schema_valid", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("provider_error", sa.String(length=64), nullable=True),
        sa.Column("goal_alignment", sa.String(length=16), nullable=False),
        sa.Column("constraint_adherence", sa.String(length=16), nullable=False),
        sa.Column("factual_grounding", sa.String(length=16), nullable=False),
        sa.Column("actionability", sa.String(length=16), nullable=False),
        sa.Column("unsupported_assumptions", sa.JSON(), nullable=False),
        sa.Column("baseline_divergence", sa.String(length=16), nullable=False),
        sa.Column("forbidden_term_hits", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shadow_evaluations_user_id", "shadow_evaluations", ["user_id"])
    op.create_index("ix_shadow_evaluations_thread_id", "shadow_evaluations", ["thread_id"])
    op.create_index("ix_shadow_evaluations_decision_type", "shadow_evaluations", ["decision_type"])
    op.create_index("ix_shadow_evaluations_context_hash", "shadow_evaluations", ["context_hash"])


def downgrade() -> None:
    op.drop_index("ix_shadow_evaluations_context_hash", table_name="shadow_evaluations")
    op.drop_index("ix_shadow_evaluations_decision_type", table_name="shadow_evaluations")
    op.drop_index("ix_shadow_evaluations_thread_id", table_name="shadow_evaluations")
    op.drop_index("ix_shadow_evaluations_user_id", table_name="shadow_evaluations")
    op.drop_table("shadow_evaluations")
