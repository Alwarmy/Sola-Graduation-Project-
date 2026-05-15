"""add learning plan item execution fields

Revision ID: 9c7f3d2a4e11
Revises: 5d2a7c91e8f4
Create Date: 2026-03-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "9c7f3d2a4e11"
down_revision = "5d2a7c91e8f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("learning_plan_items", sa.Column("actual_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("learning_plan_items", sa.Column("actual_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("learning_plan_items", sa.Column("actual_minutes", sa.Integer(), nullable=True))
    op.add_column("learning_plan_items", sa.Column("skipped_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("learning_plan_items", sa.Column("skip_reason", sa.String(), nullable=True))

    op.create_index("ix_learning_plan_items_actual_started_at", "learning_plan_items", ["actual_started_at"], unique=False)
    op.create_index("ix_learning_plan_items_actual_completed_at", "learning_plan_items", ["actual_completed_at"], unique=False)
    op.create_index("ix_learning_plan_items_skipped_at", "learning_plan_items", ["skipped_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_learning_plan_items_skipped_at", table_name="learning_plan_items")
    op.drop_index("ix_learning_plan_items_actual_completed_at", table_name="learning_plan_items")
    op.drop_index("ix_learning_plan_items_actual_started_at", table_name="learning_plan_items")

    op.drop_column("learning_plan_items", "skip_reason")
    op.drop_column("learning_plan_items", "skipped_at")
    op.drop_column("learning_plan_items", "actual_minutes")
    op.drop_column("learning_plan_items", "actual_completed_at")
    op.drop_column("learning_plan_items", "actual_started_at")