from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.db.base import Base


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)

    source = Column(String, nullable=False, index=True)
    external_id = Column(String, nullable=False, unique=True, index=True)
    content_type = Column(String, nullable=False, index=True)

    title = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)

    provider = Column(String, nullable=False, index=True)
    channel_title = Column(String, nullable=True, index=True)
    instructor_name = Column(String, nullable=True, index=True)

    language = Column(String, nullable=True, index=True)

    # Legacy compatibility field retained for current API/consumers.
    level = Column(String, nullable=True, index=True)

    difficulty_level = Column(String, nullable=True, index=True)
    duration_minutes_total = Column(Integer, nullable=True, index=True)
    duration_is_estimated = Column(Boolean, nullable=False, default=False)

    pricing_model = Column(String, nullable=False, default="free", index=True)

    topic_tags = Column(JSONB, nullable=False, default=list)
    quality_score = Column(Integer, nullable=True, index=True)
    quality_signals = Column(JSONB, nullable=False, default=dict)

    prerequisite_hint = Column(Text, nullable=True)
    progression_hint = Column(String, nullable=True, index=True)

    provider_metadata = Column(JSONB, nullable=False, default=dict)

    url = Column(String, nullable=True)
    thumbnail_url = Column(String, nullable=True)

    published_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )