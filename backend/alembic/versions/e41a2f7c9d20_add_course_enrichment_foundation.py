"""add course enrichment foundation

Revision ID: e41a2f7c9d20
Revises: c9d41b7a2f10
Create Date: 2026-03-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e41a2f7c9d20"
down_revision: Union[str, None] = "c9d41b7a2f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("instructor_name", sa.String(), nullable=True))
    op.add_column("courses", sa.Column("difficulty_level", sa.String(), nullable=True))
    op.add_column("courses", sa.Column("duration_minutes_total", sa.Integer(), nullable=True))
    op.add_column(
        "courses",
        sa.Column("duration_is_estimated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "courses",
        sa.Column("pricing_model", sa.String(), nullable=False, server_default="free"),
    )
    op.add_column(
        "courses",
        sa.Column(
            "topic_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("courses", sa.Column("quality_score", sa.Integer(), nullable=True))
    op.add_column(
        "courses",
        sa.Column(
            "quality_signals",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column("courses", sa.Column("prerequisite_hint", sa.Text(), nullable=True))
    op.add_column("courses", sa.Column("progression_hint", sa.String(), nullable=True))
    op.add_column(
        "courses",
        sa.Column(
            "provider_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    op.create_index("ix_courses_instructor_name", "courses", ["instructor_name"], unique=False)
    op.create_index("ix_courses_difficulty_level", "courses", ["difficulty_level"], unique=False)
    op.create_index("ix_courses_duration_minutes_total", "courses", ["duration_minutes_total"], unique=False)
    op.create_index("ix_courses_pricing_model", "courses", ["pricing_model"], unique=False)
    op.create_index("ix_courses_quality_score", "courses", ["quality_score"], unique=False)
    op.create_index("ix_courses_progression_hint", "courses", ["progression_hint"], unique=False)
    op.create_index("ix_courses_level", "courses", ["level"], unique=False)

    op.execute(
        """
        UPDATE courses
        SET instructor_name = channel_title
        WHERE instructor_name IS NULL
          AND channel_title IS NOT NULL
        """
    )

    op.execute(
        """
        UPDATE courses
        SET pricing_model = 'free'
        WHERE pricing_model IS NULL
        """
    )

    op.execute(
        """
        UPDATE courses
        SET difficulty_level = LOWER(level)
        WHERE difficulty_level IS NULL
          AND level IS NOT NULL
        """
    )

    op.execute(
        """
        UPDATE courses
        SET progression_hint =
            CASE
                WHEN difficulty_level = 'beginner' THEN 'foundation'
                WHEN difficulty_level = 'intermediate' THEN 'next_step'
                WHEN difficulty_level = 'advanced' THEN 'specialization'
                ELSE progression_hint
            END
        WHERE progression_hint IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_courses_level", table_name="courses")
    op.drop_index("ix_courses_progression_hint", table_name="courses")
    op.drop_index("ix_courses_quality_score", table_name="courses")
    op.drop_index("ix_courses_pricing_model", table_name="courses")
    op.drop_index("ix_courses_duration_minutes_total", table_name="courses")
    op.drop_index("ix_courses_difficulty_level", table_name="courses")
    op.drop_index("ix_courses_instructor_name", table_name="courses")

    op.drop_column("courses", "provider_metadata")
    op.drop_column("courses", "progression_hint")
    op.drop_column("courses", "prerequisite_hint")
    op.drop_column("courses", "quality_signals")
    op.drop_column("courses", "quality_score")
    op.drop_column("courses", "topic_tags")
    op.drop_column("courses", "pricing_model")
    op.drop_column("courses", "duration_is_estimated")
    op.drop_column("courses", "duration_minutes_total")
    op.drop_column("courses", "difficulty_level")
    op.drop_column("courses", "instructor_name")