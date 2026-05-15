"""add schedule revision to learning plans

Revision ID: b61d2c8f4a90
Revises: 9c7f3d2a4e11
Create Date: 2026-03-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b61d2c8f4a90"
down_revision = "9c7f3d2a4e11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("learning_plans", sa.Column("schedule_revision", sa.Integer(), nullable=True))
    op.execute("UPDATE learning_plans SET schedule_revision = 1 WHERE schedule_revision IS NULL")
    op.alter_column("learning_plans", "schedule_revision", nullable=False)


def downgrade() -> None:
    op.drop_column("learning_plans", "schedule_revision")