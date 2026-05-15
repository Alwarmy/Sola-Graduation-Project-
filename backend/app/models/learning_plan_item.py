from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.domain_values import LEARNING_PLAN_ITEM_STATUS_VALUES, sql_string_list
from app.db.base import Base


class LearningPlanItem(Base):
    __tablename__ = "learning_plan_items"
    __table_args__ = (
        UniqueConstraint(
            "plan_id",
            "plan_course_id",
            "course_unit_id",
            "segment_index",
            name="uq_plan_item_unit_segment",
        ),
        CheckConstraint(
            f"status IN {sql_string_list(LEARNING_PLAN_ITEM_STATUS_VALUES)}",
            name="ck_learning_plan_items_status",
        ),
        CheckConstraint("version >= 1", name="ck_learning_plan_items_version"),
        CheckConstraint("segment_index >= 1", name="ck_learning_plan_items_segment_index"),
        CheckConstraint("schedule_order_index >= 1", name="ck_learning_plan_items_schedule_order_index"),
        CheckConstraint("source_order_index >= 1", name="ck_learning_plan_items_source_order_index"),
        CheckConstraint("planned_minutes > 0", name="ck_learning_plan_items_planned_minutes"),
        CheckConstraint(
            "status <> 'completed' OR actual_completed_at IS NOT NULL",
            name="ck_learning_plan_items_completed_timestamp",
        ),
        CheckConstraint(
            "status <> 'skipped' OR skipped_at IS NOT NULL",
            name="ck_learning_plan_items_skipped_timestamp",
        ),
        CheckConstraint(
            "NOT (actual_completed_at IS NOT NULL AND skipped_at IS NOT NULL)",
            name="ck_learning_plan_items_completion_skip_exclusive",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    plan_id = Column(Integer, ForeignKey("learning_plans.id"), nullable=False, index=True)
    plan_course_id = Column(Integer, ForeignKey("learning_plan_courses.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    course_unit_id = Column(Integer, ForeignKey("course_units.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    item_type = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="pending", index=True)
    version = Column(Integer, nullable=False, default=1)

    schedule_order_index = Column(Integer, nullable=False, index=True)
    source_order_index = Column(Integer, nullable=False)

    scheduled_date = Column(Date, nullable=False, index=True)
    time_window = Column(String, nullable=False, index=True)

    planned_minutes = Column(Integer, nullable=False)

    actual_started_at = Column(DateTime(timezone=True), nullable=True, index=True)
    actual_completed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    actual_minutes = Column(Integer, nullable=True)

    skipped_at = Column(DateTime(timezone=True), nullable=True, index=True)
    skip_reason = Column(String, nullable=True)

    segment_index = Column(Integer, nullable=False, default=1)
    segment_start_second = Column(Integer, nullable=True)
    segment_end_second = Column(Integer, nullable=True)

    practical_signal = Column(String, nullable=False, default="mixed", index=True)
    load_signal = Column(String, nullable=False, default="medium", index=True)

    item_metadata = Column(JSONB, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    plan = relationship("LearningPlan", back_populates="items")
    plan_course = relationship("LearningPlanCourse", back_populates="items")
    course = relationship("Course")
    course_unit = relationship("CourseUnit")
