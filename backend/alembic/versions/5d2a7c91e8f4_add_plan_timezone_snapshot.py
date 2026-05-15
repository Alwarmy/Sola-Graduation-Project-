"""add plan timezone snapshot

Revision ID: 5d2a7c91e8f4
Revises: c4a1f3e2b7d9
Create Date: 2026-03-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "5d2a7c91e8f4"
down_revision = "c4a1f3e2b7d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "learning_plans",
        sa.Column("schedule_timezone_snapshot", sa.String(), nullable=True),
    )
    op.execute(
        "UPDATE learning_plans "
        "SET schedule_timezone_snapshot = 'Asia/Riyadh' "
        "WHERE schedule_timezone_snapshot IS NULL"
    )
    op.alter_column("learning_plans", "schedule_timezone_snapshot", nullable=False)
    op.create_index(
        "ix_learning_plans_schedule_timezone_snapshot",
        "learning_plans",
        ["schedule_timezone_snapshot"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_learning_plans_schedule_timezone_snapshot",
        table_name="learning_plans",
    )
    op.drop_column("learning_plans", "schedule_timezone_snapshot")