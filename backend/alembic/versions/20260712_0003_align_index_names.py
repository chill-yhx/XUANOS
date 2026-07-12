"""Align workflow index names with SQLAlchemy metadata.

Revision ID: 20260712_0003
Revises: 20260712_0002
Create Date: 2026-07-12
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260712_0003"
down_revision: str | None = "20260712_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_answers_session_id", table_name="answers")
    op.create_index("ix_answers_understanding_session_id", "answers", ["understanding_session_id"])
    op.drop_index("ix_goals_session_id", table_name="goals")
    op.create_index("ix_goals_understanding_session_id", "goals", ["understanding_session_id"])


def downgrade() -> None:
    op.drop_index("ix_goals_understanding_session_id", table_name="goals")
    op.create_index("ix_goals_session_id", "goals", ["understanding_session_id"])
    op.drop_index("ix_answers_understanding_session_id", table_name="answers")
    op.create_index("ix_answers_session_id", "answers", ["understanding_session_id"])
