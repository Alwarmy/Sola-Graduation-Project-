"""harden block 7 learning state

Revision ID: 3b9ee03aa169
Revises: 8f94c828d81b
Create Date: 2026-03-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "3b9ee03aa169"
down_revision: Union[str, Sequence[str], None] = "8f94c828d81b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_learning_states",
        sa.Column(
            "covered_topics",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "user_learning_states",
        sa.Column(
            "topic_familiarity",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "user_learning_states",
        sa.Column(
            "topic_families",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "user_learning_states",
        sa.Column(
            "profile_alignment",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_learning_states", "profile_alignment")
    op.drop_column("user_learning_states", "topic_families")
    op.drop_column("user_learning_states", "topic_familiarity")
    op.drop_column("user_learning_states", "covered_topics")