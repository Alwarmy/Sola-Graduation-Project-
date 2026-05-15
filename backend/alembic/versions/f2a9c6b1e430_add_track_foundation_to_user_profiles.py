"""add track foundation to user profiles

Revision ID: f2a9c6b1e430
Revises: e41a2f7c9d20
Create Date: 2026-03-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "f2a9c6b1e430"
down_revision: Union[str, None] = "e41a2f7c9d20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_profiles", sa.Column("primary_track", sa.String(), nullable=True))
    op.add_column(
        "user_profiles",
        sa.Column(
            "secondary_tracks",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("user_profiles", sa.Column("target_role", sa.String(), nullable=True))
    op.add_column("user_profiles", sa.Column("experience_level", sa.String(), nullable=True))

    op.execute(
        """
        UPDATE user_profiles
        SET primary_track = background_track
        WHERE primary_track IS NULL
        """
    )

    op.alter_column("user_profiles", "primary_track", nullable=False)

    op.create_index("ix_user_profiles_primary_track", "user_profiles", ["primary_track"], unique=False)
    op.create_index("ix_user_profiles_target_role", "user_profiles", ["target_role"], unique=False)
    op.create_index("ix_user_profiles_experience_level", "user_profiles", ["experience_level"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_profiles_experience_level", table_name="user_profiles")
    op.drop_index("ix_user_profiles_target_role", table_name="user_profiles")
    op.drop_index("ix_user_profiles_primary_track", table_name="user_profiles")

    op.drop_column("user_profiles", "experience_level")
    op.drop_column("user_profiles", "target_role")
    op.drop_column("user_profiles", "secondary_tracks")
    op.drop_column("user_profiles", "primary_track")