"""Add understanding, planning, feedback, and hypothesis models.

Revision ID: 20260712_0002
Revises: 20260712_0001
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260712_0002"
down_revision: str | None = "20260712_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "understanding_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("previous_session_id", sa.String(length=36), nullable=True),
        sa.Column("expression_mode", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("user_input", sa.Text(), nullable=True),
        sa.Column("current_question_index", sa.Integer(), nullable=False),
        sa.Column("summary_version", sa.Integer(), nullable=False),
        sa.Column("real_goal", sa.Text(), nullable=True),
        sa.Column("foundation", sa.Text(), nullable=True),
        sa.Column("constraints_summary", sa.Text(), nullable=True),
        sa.Column("tension", sa.Text(), nullable=True),
        sa.Column("uncertain", sa.Text(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["previous_session_id"], ["understanding_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_understanding_sessions_thread_id", "understanding_sessions", ["thread_id"])
    op.create_index("ix_understanding_sessions_user_id", "understanding_sessions", ["user_id"])
    op.create_index("ix_understanding_sessions_status", "understanding_sessions", ["status"])

    op.create_table(
        "answers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("understanding_session_id", sa.String(length=36), nullable=False),
        sa.Column("question_id", sa.String(length=64), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("question_order", sa.Integer(), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("supersedes_answer_id", sa.String(length=36), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["supersedes_answer_id"], ["answers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["understanding_session_id"], ["understanding_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_answers_session_id", "answers", ["understanding_session_id"])
    op.create_index("ix_answers_question_id", "answers", ["question_id"])

    op.create_table(
        "user_corrections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=True),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=36), nullable=True),
        sa.Column("assessment", sa.String(length=32), nullable=False),
        sa.Column("previous_value", sa.Text(), nullable=False),
        sa.Column("user_value", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("system_handling", sa.Text(), nullable=True),
        sa.Column("has_conflict", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_corrections_user_id", "user_corrections", ["user_id"])
    op.create_index("ix_user_corrections_thread_id", "user_corrections", ["thread_id"])

    op.create_table(
        "goals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("understanding_session_id", sa.String(length=36), nullable=True),
        sa.Column("original_expression", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("desired_outcome", sa.Text(), nullable=False),
        sa.Column("success_criteria", sa.Text(), nullable=False),
        sa.Column("goal_type", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("current_stage", sa.String(length=160), nullable=True),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_load", sa.String(length=24), nullable=True),
        sa.Column("feasibility", sa.String(length=24), nullable=True),
        sa.Column("feasibility_basis", sa.Text(), nullable=True),
        sa.Column("user_confirmed", sa.Boolean(), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["understanding_session_id"], ["understanding_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_goals_user_id", "goals", ["user_id"])
    op.create_index("ix_goals_thread_id", "goals", ["thread_id"])
    op.create_index("ix_goals_session_id", "goals", ["understanding_session_id"])

    op.create_table(
        "constraints",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("goal_id", sa.String(length=36), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("constraint_type", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("is_hard", sa.Boolean(), nullable=False),
        sa.Column("user_confirmed", sa.Boolean(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_constraints_user_id", "constraints", ["user_id"])
    op.create_index("ix_constraints_thread_id", "constraints", ["thread_id"])

    op.create_table(
        "plans",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("root_plan_id", sa.String(length=36), nullable=False),
        sa.Column("previous_plan_id", sa.String(length=36), nullable=True),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("understanding_session_id", sa.String(length=36), nullable=False),
        sa.Column("primary_goal_id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("stage", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("single_action", sa.Text(), nullable=False),
        sa.Column("completion_standard", sa.Text(), nullable=False),
        sa.Column("review_condition", sa.Text(), nullable=False),
        sa.Column("workload", sa.String(length=24), nullable=False),
        sa.Column("system_recommendation", sa.Text(), nullable=False),
        sa.Column("is_user_final_choice", sa.Boolean(), nullable=False),
        sa.Column("user_final_choice", sa.Text(), nullable=True),
        sa.Column("modification_reason", sa.String(length=48), nullable=True),
        sa.Column("expected_impact", sa.Text(), nullable=True),
        sa.Column("warning_level", sa.String(length=16), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["previous_plan_id"], ["plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["primary_goal_id"], ["goals.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["understanding_session_id"], ["understanding_sessions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("root_plan_id", "version", name="uq_plan_root_version"),
    )
    op.create_index("ix_plans_root_plan_id", "plans", ["root_plan_id"])
    op.create_index("ix_plans_thread_id", "plans", ["thread_id"])
    op.create_index("ix_plans_user_id", "plans", ["user_id"])
    op.create_index("ix_plans_status", "plans", ["status"])

    op.create_table(
        "plan_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("goal_id", sa.String(length=36), nullable=True),
        sa.Column("item_type", sa.String(length=32), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("time_block", sa.String(length=32), nullable=True),
        sa.Column("estimated_minutes", sa.Integer(), nullable=True),
        sa.Column("difficulty", sa.Integer(), nullable=True),
        sa.Column("completion_standard", sa.Text(), nullable=True),
        sa.Column("is_optional", sa.Boolean(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("is_user_modified", sa.Boolean(), nullable=False),
        sa.Column("modification_note", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_items_plan_id", "plan_items", ["plan_id"])

    op.create_table(
        "action_results",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("plan_id", sa.String(length=36), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("started", sa.Boolean(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("progress_percent", sa.Integer(), nullable=False),
        sa.Column("actual_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("obstacle_code", sa.String(length=48), nullable=False),
        sa.Column("obstacle_detail", sa.Text(), nullable=True),
        sa.Column("energy_change", sa.Text(), nullable=True),
        sa.Column("unrealistic_part", sa.Text(), nullable=True),
        sa.Column("original_judgment", sa.Text(), nullable=False),
        sa.Column("actual_result_summary", sa.Text(), nullable=False),
        sa.Column("revised_judgment", sa.Text(), nullable=False),
        sa.Column("next_adjustment", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_action_result_idempotency"),
    )
    op.create_index("ix_action_results_user_id", "action_results", ["user_id"])
    op.create_index("ix_action_results_thread_id", "action_results", ["thread_id"])
    op.create_index("ix_action_results_plan_id", "action_results", ["plan_id"])

    op.create_table(
        "hypotheses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("thread_id", sa.String(length=36), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("confidence_internal", sa.Float(), nullable=True),
        sa.Column("supporting_evidence", sa.JSON(), nullable=False),
        sa.Column("opposing_evidence", sa.JSON(), nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False),
        sa.Column("user_attitude", sa.String(length=24), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hypotheses_user_id", "hypotheses", ["user_id"])
    op.create_index("ix_hypotheses_thread_id", "hypotheses", ["thread_id"])
    op.create_index("ix_hypotheses_category", "hypotheses", ["category"])
    op.create_index("ix_hypotheses_status", "hypotheses", ["status"])

    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("route", sa.String(length=160), nullable=False),
        sa.Column("key", sa.String(length=160), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=48), nullable=False),
        sa.Column("resource_id", sa.String(length=36), nullable=False),
        sa.Column("response_data", sa.JSON(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "route", "key", name="uq_idempotency_scope_key"),
    )
    op.create_index("ix_idempotency_records_user_id", "idempotency_records", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_idempotency_records_user_id", table_name="idempotency_records")
    op.drop_table("idempotency_records")
    op.drop_index("ix_hypotheses_status", table_name="hypotheses")
    op.drop_index("ix_hypotheses_category", table_name="hypotheses")
    op.drop_index("ix_hypotheses_thread_id", table_name="hypotheses")
    op.drop_index("ix_hypotheses_user_id", table_name="hypotheses")
    op.drop_table("hypotheses")
    op.drop_index("ix_action_results_plan_id", table_name="action_results")
    op.drop_index("ix_action_results_thread_id", table_name="action_results")
    op.drop_index("ix_action_results_user_id", table_name="action_results")
    op.drop_table("action_results")
    op.drop_index("ix_plan_items_plan_id", table_name="plan_items")
    op.drop_table("plan_items")
    op.drop_index("ix_plans_status", table_name="plans")
    op.drop_index("ix_plans_user_id", table_name="plans")
    op.drop_index("ix_plans_thread_id", table_name="plans")
    op.drop_index("ix_plans_root_plan_id", table_name="plans")
    op.drop_table("plans")
    op.drop_index("ix_constraints_thread_id", table_name="constraints")
    op.drop_index("ix_constraints_user_id", table_name="constraints")
    op.drop_table("constraints")
    op.drop_index("ix_goals_session_id", table_name="goals")
    op.drop_index("ix_goals_thread_id", table_name="goals")
    op.drop_index("ix_goals_user_id", table_name="goals")
    op.drop_table("goals")
    op.drop_index("ix_user_corrections_thread_id", table_name="user_corrections")
    op.drop_index("ix_user_corrections_user_id", table_name="user_corrections")
    op.drop_table("user_corrections")
    op.drop_index("ix_answers_question_id", table_name="answers")
    op.drop_index("ix_answers_session_id", table_name="answers")
    op.drop_table("answers")
    op.drop_index("ix_understanding_sessions_status", table_name="understanding_sessions")
    op.drop_index("ix_understanding_sessions_user_id", table_name="understanding_sessions")
    op.drop_index("ix_understanding_sessions_thread_id", table_name="understanding_sessions")
    op.drop_table("understanding_sessions")
