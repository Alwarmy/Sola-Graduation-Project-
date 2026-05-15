from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.db.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    # Legacy compatibility field retained for existing flows.
    background_track = Column(String, nullable=False, index=True)

    primary_track = Column(String, nullable=False, index=True)
    secondary_tracks = Column(JSONB, nullable=False, default=list)

    target_role = Column(String, nullable=True, index=True)
    experience_level = Column(String, nullable=True, index=True)

    employment_status = Column(String, nullable=False, index=True)
    is_student = Column(Boolean, nullable=False, default=False)
    education_major = Column(String, nullable=True)
    weekly_hours = Column(Integer, nullable=False)
    goal = Column(String, nullable=False, index=True)
    preferred_language = Column(String, nullable=False, index=True)
    bio = Column(Text, nullable=True)
    timezone = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )