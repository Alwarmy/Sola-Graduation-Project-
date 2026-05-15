"""add user ownership to course ingestions

Revision ID: c9d41b7a2f10
Revises: b61d2c8f4a90
Create Date: 2026-03-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9d41b7a2f10"
down_revision: Union[str, None] = "b61d2c8f4a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM raw_courses")
    op.execute("DELETE FROM course_ingestions")

    op.add_column(
        "course_ingestions",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_course_ingestions_user_id_users",
        "course_ingestions",
        "users",
        ["user_id"],
        ["id"],
    )
    op.create_index(
        "ix_course_ingestions_user_id",
        "course_ingestions",
        ["user_id"],
        unique=False,
    )
    op.alter_column("course_ingestions", "user_id", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_course_ingestions_user_id", table_name="course_ingestions")
    op.drop_constraint(
        "fk_course_ingestions_user_id_users",
        "course_ingestions",
        type_="foreignkey",
    )
    op.drop_column("course_ingestions", "user_id")