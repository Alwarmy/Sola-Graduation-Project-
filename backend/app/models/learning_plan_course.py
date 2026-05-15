from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class LearningPlanCourse(Base):
    __tablename__ = "learning_plan_courses"
    __table_args__ = (
        UniqueConstraint("plan_id", "course_id", name="uq_learning_plan_course"),
    )

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("learning_plans.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)

    priority = Column(Integer, nullable=False, default=1)
    order_index = Column(Integer, nullable=False, default=1)
    status = Column(String, nullable=False, default="active", index=True)
    rationale = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    plan = relationship("LearningPlan", back_populates="courses")
    course = relationship("Course")
    items = relationship(
        "LearningPlanItem",
        back_populates="plan_course",
        cascade="all, delete-orphan",
        order_by="LearningPlanItem.schedule_order_index",
    )