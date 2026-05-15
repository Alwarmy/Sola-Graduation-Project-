from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class SchedulingPreference(Base):
    __tablename__ = "scheduling_preferences"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("learning_plans.id"), nullable=False, unique=True, index=True)

    preferred_time_window = Column(String, nullable=False, index=True)
    pace_mode = Column(String, nullable=False, index=True)

    preferred_study_days = Column(JSONB, nullable=False, default=list)

    max_daily_minutes = Column(Integer, nullable=False, default=180)
    session_cap_minutes = Column(Integer, nullable=False, default=45)

    temporary_note = Column(Text, nullable=True)
    deadline_date = Column(Date, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    plan = relationship("LearningPlan", back_populates="preference")

    @property
    def plan_version(self) -> int | None:
        if self.plan is None:
            return None
        return self.plan.version
