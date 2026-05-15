from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.base import Base


class RawCourse(Base):
    __tablename__ = "raw_courses"

    id = Column(Integer, primary_key=True, index=True)
    ingestion_id = Column(Integer, ForeignKey("course_ingestions.id"), nullable=False, index=True)

    source = Column(String, nullable=False, index=True)
    external_id = Column(String, nullable=False, index=True)
    content_type = Column(String, nullable=False, index=True)

    normalized_title = Column(String, nullable=True, index=True)
    channel_title = Column(String, nullable=True, index=True)
    language = Column(String, nullable=True, index=True)

    raw_data = Column(JSONB, nullable=False)

    is_processed = Column(Boolean, nullable=False, default=False, index=True)
    is_accepted = Column(Boolean, nullable=True, index=True)
    rejection_reason = Column(Text, nullable=True)

    published_at = Column(DateTime(timezone=True), nullable=True)

    ingestion = relationship("CourseIngestion", back_populates="raw_courses")