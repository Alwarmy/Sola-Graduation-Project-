from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.db.base import Base


class UserLearningState(Base):
    __tablename__ = "user_learning_states"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    dominant_interests = Column(JSONB, nullable=False, default=list)
    emerging_interests = Column(JSONB, nullable=False, default=list)
    covered_topics = Column(JSONB, nullable=False, default=list)
    topic_familiarity = Column(JSONB, nullable=False, default=dict)
    topic_families = Column(JSONB, nullable=False, default=dict)

    current_focus = Column(String, nullable=True, index=True)

    preferred_content_type = Column(String, nullable=True, index=True)
    preferred_course_length = Column(String, nullable=True, index=True)
    effective_preferred_language = Column(String, nullable=True, index=True)

    engagement_score = Column(Integer, nullable=False, default=0)

    source_profile_snapshot = Column(JSONB, nullable=False, default=dict)
    source_event_summary = Column(JSONB, nullable=False, default=dict)
    profile_alignment = Column(JSONB, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )