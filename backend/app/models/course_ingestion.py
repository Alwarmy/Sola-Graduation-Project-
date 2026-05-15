from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.domain_values import COURSE_INGESTION_STATUS_VALUES, sql_string_list
from app.db.base import Base


class CourseIngestion(Base):
    __tablename__ = "course_ingestions"
    __table_args__ = (
        CheckConstraint(
            f"status IN {sql_string_list(COURSE_INGESTION_STATUS_VALUES)}",
            name="ck_course_ingestions_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    source = Column(String, nullable=False, index=True)
    query = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User")
    raw_courses = relationship("RawCourse", back_populates="ingestion")
