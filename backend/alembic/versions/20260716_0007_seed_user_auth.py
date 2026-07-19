"""Add invite-only mainland phone authentication.

Revision ID: 20260716_0007
Revises: 20260715_0006
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260716_0007"
down_revision: str | None = "20260715_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("phone_e164", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("password_hash", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("status", sa.String(length=16), server_default="active", nullable=False))
        batch_op.add_column(sa.Column("is_invited", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.add_column(sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("password_updated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index("ix_users_phone_e164", ["phone_e164"], unique=True)

    op.create_table(
        "sms_verification_codes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=True),
        sa.Column("phone_e164", sa.String(length=20), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("request_ip", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sms_verification_codes_user_id", "sms_verification_codes", ["user_id"])
    op.create_index("ix_sms_verification_codes_phone_e164", "sms_verification_codes", ["phone_e164"])
    op.create_index("ix_sms_verification_codes_purpose", "sms_verification_codes", ["purpose"])

    op.create_table(
        "auth_rate_limit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("subject_hash", sa.String(length=64), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("succeeded", sa.Boolean(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_rate_limit_events_subject_hash", "auth_rate_limit_events", ["subject_hash"])
    op.create_index("ix_auth_rate_limit_events_ip_address", "auth_rate_limit_events", ["ip_address"])
    op.create_index("ix_auth_rate_limit_events_action", "auth_rate_limit_events", ["action"])


def downgrade() -> None:
    op.drop_index("ix_auth_rate_limit_events_action", table_name="auth_rate_limit_events")
    op.drop_index("ix_auth_rate_limit_events_ip_address", table_name="auth_rate_limit_events")
    op.drop_index("ix_auth_rate_limit_events_subject_hash", table_name="auth_rate_limit_events")
    op.drop_table("auth_rate_limit_events")

    op.drop_index("ix_sms_verification_codes_purpose", table_name="sms_verification_codes")
    op.drop_index("ix_sms_verification_codes_phone_e164", table_name="sms_verification_codes")
    op.drop_index("ix_sms_verification_codes_user_id", table_name="sms_verification_codes")
    op.drop_table("sms_verification_codes")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_phone_e164")
        batch_op.drop_column("password_updated_at")
        batch_op.drop_column("last_login_at")
        batch_op.drop_column("is_invited")
        batch_op.drop_column("status")
        batch_op.drop_column("phone_verified_at")
        batch_op.drop_column("password_hash")
        batch_op.drop_column("phone_e164")
