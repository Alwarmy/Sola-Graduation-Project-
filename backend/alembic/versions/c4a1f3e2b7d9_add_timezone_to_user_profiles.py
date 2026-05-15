"""add timezone to user profiles

Revision ID: c4a1f3e2b7d9
Revises: 85292fdfecc2
Create Date: 2026-03-19 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c4a1f3e2b7d9"
down_revision = "85292fdfecc2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_profiles", sa.Column("timezone", sa.String(), nullable=True))
    op.execute("UPDATE user_profiles SET timezone = 'Asia/Riyadh' WHERE timezone IS NULL")
    op.alter_column("user_profiles", "timezone", nullable=False)
    op.create_index("ix_user_profiles_timezone", "user_profiles", ["timezone"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_profiles_timezone", table_name="user_profiles")
    op.drop_column("user_profiles", "timezone")