"""add assistant foundation tables

Revision ID: 6f3d1c2ab901
Revises: f2a9c6b1e430
Create Date: 2026-03-26 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "6f3d1c2ab901"
down_revision: Union[str, None] = "f2a9c6b1e430"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistant_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column(
            "conversation_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("last_user_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_assistant_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_assistant_conversations_user_id",
        "assistant_conversations",
        ["user_id"],
    )
    op.create_index(
        "ix_assistant_conversations_status",
        "assistant_conversations",
        ["status"],
    )

    op.create_table(
        "assistant_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("assistant_conversations.id"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("message_intent", sa.String(), nullable=True),
        sa.Column(
            "message_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "context_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_assistant_messages_conversation_id",
        "assistant_messages",
        ["conversation_id"],
    )
    op.create_index(
        "ix_assistant_messages_user_id",
        "assistant_messages",
        ["user_id"],
    )
    op.create_index(
        "ix_assistant_messages_role",
        "assistant_messages",
        ["role"],
    )
    op.create_index(
        "ix_assistant_messages_message_intent",
        "assistant_messages",
        ["message_intent"],
    )

    op.create_table(
        "assistant_memory_signals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("assistant_conversations.id"),
            nullable=True,
        ),
        sa.Column(
            "source_message_id",
            sa.Integer(),
            sa.ForeignKey("assistant_messages.id"),
            nullable=True,
        ),
        sa.Column("signal_type", sa.String(), nullable=False),
        sa.Column("signal_key", sa.String(), nullable=False),
        sa.Column("signal_summary", sa.String(), nullable=False),
        sa.Column(
            "signal_value",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "signal_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="proposed"),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_assistant_memory_signals_user_id",
        "assistant_memory_signals",
        ["user_id"],
    )
    op.create_index(
        "ix_assistant_memory_signals_conversation_id",
        "assistant_memory_signals",
        ["conversation_id"],
    )
    op.create_index(
        "ix_assistant_memory_signals_source_message_id",
        "assistant_memory_signals",
        ["source_message_id"],
    )
    op.create_index(
        "ix_assistant_memory_signals_signal_type",
        "assistant_memory_signals",
        ["signal_type"],
    )
    op.create_index(
        "ix_assistant_memory_signals_signal_key",
        "assistant_memory_signals",
        ["signal_key"],
    )
    op.create_index(
        "ix_assistant_memory_signals_scope",
        "assistant_memory_signals",
        ["scope"],
    )
    op.create_index(
        "ix_assistant_memory_signals_status",
        "assistant_memory_signals",
        ["status"],
    )

    op.create_table(
        "assistant_action_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("assistant_conversations.id"),
            nullable=False,
        ),
        sa.Column(
            "source_message_id",
            sa.Integer(),
            sa.ForeignKey("assistant_messages.id"),
            nullable=True,
        ),
        sa.Column("action_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="proposed"),
        sa.Column(
            "request_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "preview_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "result_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_assistant_action_runs_user_id",
        "assistant_action_runs",
        ["user_id"],
    )
    op.create_index(
        "ix_assistant_action_runs_conversation_id",
        "assistant_action_runs",
        ["conversation_id"],
    )
    op.create_index(
        "ix_assistant_action_runs_source_message_id",
        "assistant_action_runs",
        ["source_message_id"],
    )
    op.create_index(
        "ix_assistant_action_runs_action_type",
        "assistant_action_runs",
        ["action_type"],
    )
    op.create_index(
        "ix_assistant_action_runs_status",
        "assistant_action_runs",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_assistant_action_runs_status", table_name="assistant_action_runs")
    op.drop_index("ix_assistant_action_runs_action_type", table_name="assistant_action_runs")
    op.drop_index(
        "ix_assistant_action_runs_source_message_id",
        table_name="assistant_action_runs",
    )
    op.drop_index(
        "ix_assistant_action_runs_conversation_id",
        table_name="assistant_action_runs",
    )
    op.drop_index("ix_assistant_action_runs_user_id", table_name="assistant_action_runs")
    op.drop_table("assistant_action_runs")

    op.drop_index(
        "ix_assistant_memory_signals_status",
        table_name="assistant_memory_signals",
    )
    op.drop_index(
        "ix_assistant_memory_signals_scope",
        table_name="assistant_memory_signals",
    )
    op.drop_index(
        "ix_assistant_memory_signals_signal_key",
        table_name="assistant_memory_signals",
    )
    op.drop_index(
        "ix_assistant_memory_signals_signal_type",
        table_name="assistant_memory_signals",
    )
    op.drop_index(
        "ix_assistant_memory_signals_source_message_id",
        table_name="assistant_memory_signals",
    )
    op.drop_index(
        "ix_assistant_memory_signals_conversation_id",
        table_name="assistant_memory_signals",
    )
    op.drop_index(
        "ix_assistant_memory_signals_user_id",
        table_name="assistant_memory_signals",
    )
    op.drop_table("assistant_memory_signals")

    op.drop_index(
        "ix_assistant_messages_message_intent",
        table_name="assistant_messages",
    )
    op.drop_index("ix_assistant_messages_role", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_user_id", table_name="assistant_messages")
    op.drop_index(
        "ix_assistant_messages_conversation_id",
        table_name="assistant_messages",
    )
    op.drop_table("assistant_messages")

    op.drop_index(
        "ix_assistant_conversations_status",
        table_name="assistant_conversations",
    )
    op.drop_index(
        "ix_assistant_conversations_user_id",
        table_name="assistant_conversations",
    )
    op.drop_table("assistant_conversations")