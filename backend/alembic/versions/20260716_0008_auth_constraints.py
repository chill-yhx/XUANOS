"""Constrain authentication status and verification code lifecycle values.

Revision ID: 20260716_0008
Revises: 20260716_0007
Create Date: 2026-07-16
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260716_0008"
down_revision: str | None = "20260716_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.create_check_constraint("ck_users_status", "status IN ('active', 'disabled')")
    with op.batch_alter_table("sms_verification_codes") as batch_op:
        batch_op.create_check_constraint(
            "ck_sms_codes_purpose",
            "purpose IN ('login', 'reset_password')",
        )
        batch_op.create_check_constraint("ck_sms_codes_attempts_nonnegative", "attempts >= 0")


def downgrade() -> None:
    with op.batch_alter_table("sms_verification_codes") as batch_op:
        batch_op.drop_constraint("ck_sms_codes_attempts_nonnegative", type_="check")
        batch_op.drop_constraint("ck_sms_codes_purpose", type_="check")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("ck_users_status", type_="check")
