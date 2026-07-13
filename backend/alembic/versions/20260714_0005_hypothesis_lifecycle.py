"""Add stable hypothesis lifecycle identity.

Revision ID: 20260714_0005
Revises: 20260714_0004
Create Date: 2026-07-14
"""

import hashlib
from collections import defaultdict
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "20260714_0005"
down_revision: str | None = "20260714_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TERMINAL_STATUSES = {"denied", "discontinued", "expired", "superseded"}


def _semantic_key(category: str, content: str) -> str:
    normalized_content = " ".join(content.casefold().split())
    normalized = f"{category.strip().casefold()}\0{normalized_content}"
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _legacy_duplicate_key(semantic_key: str, hypothesis_id: str) -> str:
    value = f"{semantic_key}\0legacy-duplicate\0{hypothesis_id}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _is_active(row: dict[str, Any]) -> bool:
    return row["status"] not in TERMINAL_STATUSES and row["user_attitude"] != "rejected"


def upgrade() -> None:
    with op.batch_alter_table("hypotheses") as batch_op:
        batch_op.add_column(sa.Column("semantic_key", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("superseded_by_id", sa.String(length=36), nullable=True))

    connection = op.get_bind()
    rows = list(
        connection.execute(
            sa.text("SELECT id, thread_id, category, content, status, user_attitude, created_at FROM hypotheses")
        ).mappings()
    )
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        values = dict(row)
        key = _semantic_key(values["category"], values["content"])
        grouped[(values["thread_id"], key)].append(values)

    for (_, semantic_key), candidates in grouped.items():
        canonical = max(
            candidates,
            key=lambda item: (_is_active(item), str(item["created_at"]), item["id"]),
        )
        connection.execute(
            sa.text("UPDATE hypotheses SET semantic_key = :semantic_key WHERE id = :id"),
            {"semantic_key": semantic_key, "id": canonical["id"]},
        )
        for duplicate in candidates:
            if duplicate["id"] == canonical["id"]:
                continue
            connection.execute(
                sa.text(
                    "UPDATE hypotheses "
                    "SET semantic_key = :semantic_key, status = 'superseded', superseded_by_id = :canonical_id "
                    "WHERE id = :id"
                ),
                {
                    "semantic_key": _legacy_duplicate_key(semantic_key, duplicate["id"]),
                    "canonical_id": canonical["id"],
                    "id": duplicate["id"],
                },
            )

    with op.batch_alter_table("hypotheses") as batch_op:
        batch_op.alter_column("semantic_key", existing_type=sa.String(length=64), nullable=False)
        batch_op.create_foreign_key(
            "fk_hypotheses_superseded_by_id_hypotheses",
            "hypotheses",
            ["superseded_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_unique_constraint(
            "uq_hypothesis_thread_semantic_key",
            ["thread_id", "semantic_key"],
        )
        batch_op.create_index("ix_hypotheses_superseded_by_id", ["superseded_by_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("hypotheses") as batch_op:
        batch_op.drop_index("ix_hypotheses_superseded_by_id")
        batch_op.drop_constraint("uq_hypothesis_thread_semantic_key", type_="unique")
        batch_op.drop_constraint("fk_hypotheses_superseded_by_id_hypotheses", type_="foreignkey")
        batch_op.drop_column("superseded_by_id")
        batch_op.drop_column("semantic_key")
