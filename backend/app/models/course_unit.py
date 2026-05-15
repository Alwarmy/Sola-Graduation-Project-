from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class CourseUnit(Base):
    __tablename__ = "course_units"
    __table_args__ = (
        UniqueConstraint(
            "course_structure_id",
            "source_order_index",
            name="uq_course_units_structure_order",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    course_structure_id = Column(
        Integer,
        ForeignKey("course_structures.id"),
        nullable=False,
        index=True,
    )

    external_unit_id = Column(String, nullable=True, index=True)
    unit_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    source_order_index = Column(Integer, nullable=False)
    raw_duration_seconds = Column(Integer, nullable=False, default=0)
    estimated_minutes = Column(Integer, nullable=False, default=0)

    start_second = Column(Integer, nullable=True)
    end_second = Column(Integer, nullable=True)

    practical_signal = Column(String, nullable=False, default="mixed", index=True)
    load_signal = Column(String, nullable=False, default="medium", index=True)

    source_metadata = Column(JSONB, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    course_structure = relationship("CourseStructure", back_populates="units")