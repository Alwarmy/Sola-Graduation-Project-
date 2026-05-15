from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.domain_values import SCHEDULE_QUEUE_STATUS_VALUES, sql_string_list
from app.db.base import Base


class ScheduleQueueItem(Base):
    __tablename__ = "schedule_queue_items"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_schedule_queue_user_course"),
        CheckConstraint(
            f"status IN {sql_string_list(SCHEDULE_QUEUE_STATUS_VALUES)}",
            name="ck_schedule_queue_items_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)

    status = Column(String, nullable=False, default="queued", index=True)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    course = relationship("Course")
