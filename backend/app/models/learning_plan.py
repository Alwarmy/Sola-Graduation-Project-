from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.domain_values import LEARNING_PLAN_STATUS_VALUES, sql_string_list
from app.db.base import Base


class LearningPlan(Base):
    __tablename__ = "learning_plans"
    __table_args__ = (
        CheckConstraint(
            f"status IN {sql_string_list(LEARNING_PLAN_STATUS_VALUES)}",
            name="ck_learning_plans_status",
        ),
        CheckConstraint("schedule_revision >= 1", name="ck_learning_plans_schedule_revision"),
        CheckConstraint("version >= 1", name="ck_learning_plans_version"),
        Index(
            "uq_learning_plans_one_open_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('active', 'paused')"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    goal = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="active", index=True)

    current_focus_snapshot = Column(String, nullable=True, index=True)
    weekly_hours_snapshot = Column(Integer, nullable=False)
    schedule_timezone_snapshot = Column(String, nullable=False, index=True)
    schedule_revision = Column(Integer, nullable=False, default=1)
    version = Column(Integer, nullable=False, default=1)

    source_learning_state_snapshot = Column(JSONB, nullable=False, default=dict)
    plan_summary = Column(JSONB, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    courses = relationship(
        "LearningPlanCourse",
        back_populates="plan",
        cascade="all, delete-orphan",
    )
    preference = relationship(
        "SchedulingPreference",
        back_populates="plan",
        uselist=False,
        cascade="all, delete-orphan",
    )
    items = relationship(
        "LearningPlanItem",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="LearningPlanItem.schedule_order_index",
    )
