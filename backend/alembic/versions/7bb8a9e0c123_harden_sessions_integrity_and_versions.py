"""harden sessions, lifecycle integrity, and optimistic concurrency

Revision ID: 7bb8a9e0c123
Revises: 6f3d1c2ab901
Create Date: 2026-03-28 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7bb8a9e0c123"
down_revision: Union[str, Sequence[str], None] = "6f3d1c2ab901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _raise_if_any(sql: str, message: str) -> None:
    bind = op.get_bind()
    result = bind.execute(sa.text(sql))
    row = result.first()
    if row is not None:
        raise RuntimeError(message)


def upgrade() -> None:
    op.create_table(
        "auth_refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("parent_token_id", sa.Integer(), sa.ForeignKey("auth_refresh_tokens.id"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocation_reason", sa.Text(), nullable=True),
        sa.Column("created_ip", sa.String(length=255), nullable=True),
        sa.Column("created_user_agent", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("token_id", name="uq_auth_refresh_tokens_token_id"),
        sa.UniqueConstraint("token_hash", name="uq_auth_refresh_tokens_token_hash"),
    )
    op.create_index("ix_auth_refresh_tokens_id", "auth_refresh_tokens", ["id"], unique=False)
    op.create_index("ix_auth_refresh_tokens_session_id", "auth_refresh_tokens", ["session_id"], unique=False)
    op.create_index("ix_auth_refresh_tokens_parent_token_id", "auth_refresh_tokens", ["parent_token_id"], unique=False)
    op.create_index("ix_auth_refresh_tokens_user_id", "auth_refresh_tokens", ["user_id"], unique=False)
    op.create_index("ix_auth_refresh_tokens_expires_at", "auth_refresh_tokens", ["expires_at"], unique=False)
    op.create_index("ix_auth_refresh_tokens_revoked_at", "auth_refresh_tokens", ["revoked_at"], unique=False)

    op.add_column("learning_plans", sa.Column("version", sa.Integer(), nullable=True))
    op.execute("UPDATE learning_plans SET version = 1 WHERE version IS NULL")
    op.alter_column("learning_plans", "version", nullable=False)

    op.add_column("learning_plan_items", sa.Column("version", sa.Integer(), nullable=True))
    op.execute("UPDATE learning_plan_items SET version = 1 WHERE version IS NULL")
    op.alter_column("learning_plan_items", "version", nullable=False)

    _raise_if_any(
        """
        SELECT user_id
        FROM learning_plans
        WHERE status IN ('active', 'paused')
        GROUP BY user_id
        HAVING COUNT(*) > 1
        LIMIT 1
        """,
        "Cannot enforce one-open-plan-per-user: duplicate open learning plans exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plans WHERE status NOT IN ('active', 'paused', 'archived', 'completed') LIMIT 1",
        "Cannot enforce learning plan status constraint: invalid learning plan statuses exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plans WHERE schedule_revision < 1 LIMIT 1",
        "Cannot enforce learning plan schedule revision constraint: invalid revisions exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plans WHERE version < 1 LIMIT 1",
        "Cannot enforce learning plan version constraint: invalid versions exist.",
    )
    _raise_if_any(
        "SELECT id FROM schedule_queue_items WHERE status NOT IN ('queued', 'scheduled') LIMIT 1",
        "Cannot enforce schedule queue status constraint: invalid queue statuses exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plan_items WHERE status NOT IN ('pending', 'in_progress', 'completed', 'skipped') LIMIT 1",
        "Cannot enforce learning plan item status constraint: invalid item statuses exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plan_items WHERE version < 1 LIMIT 1",
        "Cannot enforce learning plan item version constraint: invalid item versions exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plan_items WHERE segment_index < 1 LIMIT 1",
        "Cannot enforce learning plan item segment index constraint: invalid segment indices exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plan_items WHERE schedule_order_index < 1 LIMIT 1",
        "Cannot enforce learning plan item schedule order constraint: invalid schedule order indices exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plan_items WHERE source_order_index < 1 LIMIT 1",
        "Cannot enforce learning plan item source order constraint: invalid source order indices exist.",
    )
    _raise_if_any(
        "SELECT id FROM learning_plan_items WHERE planned_minutes <= 0 LIMIT 1",
        "Cannot enforce learning plan item planned minutes constraint: invalid planned durations exist.",
    )
    _raise_if_any(
        """
        SELECT id
        FROM learning_plan_items
        WHERE status = 'completed' AND actual_completed_at IS NULL
        LIMIT 1
        """,
        "Cannot enforce completed item timestamp constraint: completed learning plan items are missing actual_completed_at.",
    )
    _raise_if_any(
        """
        SELECT id
        FROM learning_plan_items
        WHERE status = 'skipped' AND skipped_at IS NULL
        LIMIT 1
        """,
        "Cannot enforce skipped item timestamp constraint: skipped learning plan items are missing skipped_at.",
    )
    _raise_if_any(
        """
        SELECT id
        FROM learning_plan_items
        WHERE actual_completed_at IS NOT NULL AND skipped_at IS NOT NULL
        LIMIT 1
        """,
        "Cannot enforce mutually-exclusive completion/skip timestamps: conflicting learning plan items exist.",
    )
    _raise_if_any(
        "SELECT id FROM assistant_conversations WHERE status NOT IN ('active', 'archived') LIMIT 1",
        "Cannot enforce assistant conversation status constraint: invalid conversation statuses exist.",
    )
    _raise_if_any(
        "SELECT id FROM assistant_memory_signals WHERE scope NOT IN ('durable_preference', 'temporary_constraint', 'learning_signal') LIMIT 1",
        "Cannot enforce assistant memory scope constraint: invalid scopes exist.",
    )
    _raise_if_any(
        "SELECT id FROM assistant_memory_signals WHERE status NOT IN ('proposed', 'confirmed', 'active', 'dismissed', 'expired') LIMIT 1",
        "Cannot enforce assistant memory status constraint: invalid statuses exist.",
    )
    _raise_if_any(
        "SELECT id FROM assistant_action_runs WHERE status NOT IN ('proposed', 'confirmed', 'executed', 'failed', 'dismissed') LIMIT 1",
        "Cannot enforce assistant action status constraint: invalid statuses exist.",
    )
    _raise_if_any(
        "SELECT id FROM assistant_action_runs WHERE action_type NOT IN ('review_active_plan_adjustment_options', 'review_plan_recovery_options', 'apply_recommended_recovery', 'pause_active_plan', 'resume_active_plan', 'queue_top_recommendation') LIMIT 1",
        "Cannot enforce assistant action type constraint: invalid action types exist.",
    )
    _raise_if_any(
        "SELECT id FROM course_structures WHERE build_status NOT IN ('pending', 'built', 'failed') LIMIT 1",
        "Cannot enforce course structure build status constraint: invalid build statuses exist.",
    )
    _raise_if_any(
        "SELECT id FROM course_ingestions WHERE status NOT IN ('pending', 'success', 'failed') LIMIT 1",
        "Cannot enforce course ingestion status constraint: invalid ingestion statuses exist.",
    )

    op.create_check_constraint(
        "ck_learning_plans_status",
        "learning_plans",
        "status IN ('active', 'paused', 'archived', 'completed')",
    )
    op.create_check_constraint(
        "ck_learning_plans_schedule_revision",
        "learning_plans",
        "schedule_revision >= 1",
    )
    op.create_check_constraint(
        "ck_learning_plans_version",
        "learning_plans",
        "version >= 1",
    )
    op.create_index(
        "uq_learning_plans_one_open_per_user",
        "learning_plans",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('active', 'paused')"),
    )

    op.create_check_constraint(
        "ck_schedule_queue_items_status",
        "schedule_queue_items",
        "status IN ('queued', 'scheduled')",
    )

    op.create_check_constraint(
        "ck_learning_plan_items_status",
        "learning_plan_items",
        "status IN ('pending', 'in_progress', 'completed', 'skipped')",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_version",
        "learning_plan_items",
        "version >= 1",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_segment_index",
        "learning_plan_items",
        "segment_index >= 1",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_schedule_order_index",
        "learning_plan_items",
        "schedule_order_index >= 1",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_source_order_index",
        "learning_plan_items",
        "source_order_index >= 1",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_planned_minutes",
        "learning_plan_items",
        "planned_minutes > 0",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_completed_timestamp",
        "learning_plan_items",
        "status <> 'completed' OR actual_completed_at IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_skipped_timestamp",
        "learning_plan_items",
        "status <> 'skipped' OR skipped_at IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_learning_plan_items_completion_skip_exclusive",
        "learning_plan_items",
        "NOT (actual_completed_at IS NOT NULL AND skipped_at IS NOT NULL)",
    )

    op.create_check_constraint(
        "ck_assistant_conversations_status",
        "assistant_conversations",
        "status IN ('active', 'archived')",
    )
    op.create_check_constraint(
        "ck_assistant_memory_signals_scope",
        "assistant_memory_signals",
        "scope IN ('durable_preference', 'temporary_constraint', 'learning_signal')",
    )
    op.create_check_constraint(
        "ck_assistant_memory_signals_status",
        "assistant_memory_signals",
        "status IN ('proposed', 'confirmed', 'active', 'dismissed', 'expired')",
    )
    op.create_check_constraint(
        "ck_assistant_action_runs_status",
        "assistant_action_runs",
        "status IN ('proposed', 'confirmed', 'executed', 'failed', 'dismissed')",
    )
    op.create_check_constraint(
        "ck_assistant_action_runs_action_type",
        "assistant_action_runs",
        "action_type IN ('review_active_plan_adjustment_options', 'review_plan_recovery_options', 'apply_recommended_recovery', 'pause_active_plan', 'resume_active_plan', 'queue_top_recommendation')",
    )
    op.create_check_constraint(
        "ck_course_structures_build_status",
        "course_structures",
        "build_status IN ('pending', 'built', 'failed')",
    )
    op.create_check_constraint(
        "ck_course_ingestions_status",
        "course_ingestions",
        "status IN ('pending', 'success', 'failed')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_course_ingestions_status", "course_ingestions", type_="check")
    op.drop_constraint("ck_course_structures_build_status", "course_structures", type_="check")
    op.drop_constraint("ck_assistant_action_runs_action_type", "assistant_action_runs", type_="check")
    op.drop_constraint("ck_assistant_action_runs_status", "assistant_action_runs", type_="check")
    op.drop_constraint("ck_assistant_memory_signals_status", "assistant_memory_signals", type_="check")
    op.drop_constraint("ck_assistant_memory_signals_scope", "assistant_memory_signals", type_="check")
    op.drop_constraint("ck_assistant_conversations_status", "assistant_conversations", type_="check")
    op.drop_constraint("ck_learning_plan_items_completion_skip_exclusive", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_skipped_timestamp", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_completed_timestamp", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_planned_minutes", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_source_order_index", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_schedule_order_index", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_segment_index", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_version", "learning_plan_items", type_="check")
    op.drop_constraint("ck_learning_plan_items_status", "learning_plan_items", type_="check")
    op.drop_constraint("ck_schedule_queue_items_status", "schedule_queue_items", type_="check")
    op.drop_index("uq_learning_plans_one_open_per_user", table_name="learning_plans")
    op.drop_constraint("ck_learning_plans_version", "learning_plans", type_="check")
    op.drop_constraint("ck_learning_plans_schedule_revision", "learning_plans", type_="check")
    op.drop_constraint("ck_learning_plans_status", "learning_plans", type_="check")

    op.drop_column("learning_plan_items", "version")
    op.drop_column("learning_plans", "version")

    op.drop_index("ix_auth_refresh_tokens_revoked_at", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_expires_at", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_user_id", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_parent_token_id", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_session_id", table_name="auth_refresh_tokens")
    op.drop_index("ix_auth_refresh_tokens_id", table_name="auth_refresh_tokens")
    op.drop_table("auth_refresh_tokens")
