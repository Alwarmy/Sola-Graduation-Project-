from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.domain_values import COURSE_STRUCTURE_BUILD_STATUS_VALUES, sql_string_list
from app.db.base import Base


class CourseStructure(Base):
    __tablename__ = "course_structures"
    __table_args__ = (
        CheckConstraint(
            f"build_status IN {sql_string_list(COURSE_STRUCTURE_BUILD_STATUS_VALUES)}",
            name="ck_course_structures_build_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, unique=True, index=True)

    source = Column(String, nullable=False, index=True)
    content_type = Column(String, nullable=False, index=True)
    structure_type = Column(String, nullable=False, index=True)

    build_status = Column(String, nullable=False, default="pending", index=True)
    total_units = Column(Integer, nullable=False, default=0)
    total_minutes = Column(Integer, nullable=False, default=0)

    structure_metadata = Column(JSONB, nullable=False, default=dict)
    build_notes = Column(Text, nullable=True)
    last_built_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    course = relationship("Course")
    units = relationship(
        "CourseUnit",
        back_populates="course_structure",
        cascade="all, delete-orphan",
        order_by="CourseUnit.source_order_index",
    )
