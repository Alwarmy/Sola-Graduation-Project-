from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.domain_values import LEARNING_PLAN_STATUS_VALUES
from app.schemas.course import CourseResponse


TIME_WINDOW_OPTIONS = {
    "morning",
    "afternoon",
    "evening",
    "night",
}

PACE_MODE_OPTIONS = {
    "relaxed",
    "balanced",
    "accelerated",
}

STUDY_DAY_OPTIONS = {
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
}

PLAN_STATUS_OPTIONS = set(LEARNING_PLAN_STATUS_VALUES)


class SchedulingPreferenceBase(BaseModel):
    preferred_time_window: str | None = None
    pace_mode: str | None = None
    preferred_study_days: list[str] = Field(default_factory=list)
    max_daily_minutes: int | None = None
    session_cap_minutes: int | None = None
    temporary_note: str | None = None
    deadline_date: date | None = None


class SchedulingPreferenceUpdateRequest(SchedulingPreferenceBase):
    expected_version: int = Field(..., ge=1)


class SchedulingPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    plan_version: int | None
    preferred_time_window: str
    pace_mode: str
    preferred_study_days: list[str]
    max_daily_minutes: int
    session_cap_minutes: int
    temporary_note: str | None
    deadline_date: date | None
    created_at: datetime
    updated_at: datetime


class LearningPlanCreateRequest(SchedulingPreferenceBase):
    title: str
    goal: str
    queue_item_ids: list[int] = Field(..., min_length=1, max_length=3)


class LearningPlanStatusUpdateRequest(BaseModel):
    status: str
    expected_version: int = Field(..., ge=1)


class LearningPlanCourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    course_id: int
    priority: int
    order_index: int
    status: str
    rationale: str | None
    created_at: datetime
    updated_at: datetime
    course: CourseResponse


class LearningPlanReadinessResponse(BaseModel):
    plan_id: int
    version: int
    status: str
    schedule_timezone_snapshot: str
    schedule_revision: int
    is_open_status: bool
    is_active_status: bool
    has_preference: bool
    has_courses: bool
    has_schedule_items: bool
    active_course_count: int
    max_active_courses: int
    queued_backlog_count: int
    scheduled_queue_count: int
    preferred_time_window: str | None
    pace_mode: str | None
    preferred_study_days_count: int
    max_daily_minutes: int | None
    session_cap_minutes: int | None
    schedule_total_items: int
    schedule_total_minutes: int
    scheduled_start_date: date | None
    scheduled_end_date: date | None
    schedule_last_generated_at: datetime | None
    pending_items_count: int
    in_progress_items_count: int
    completed_items_count: int
    skipped_items_count: int
    overdue_items_count: int
    due_today_items_count: int
    completion_rate: float
    is_plan_finished: bool
    can_mark_completed: bool
    next_actionable_item_id: int | None
    next_actionable_scheduled_date: date | None
    next_actionable_title: str | None
    missed_study_slots_count: int
    overdue_minutes: int
    remaining_pending_items_count: int
    remaining_pending_minutes: int
    available_capacity_next_7_study_slots_minutes: int
    recovery_pressure_ratio: float
    drift_level: str
    needs_recovery: bool
    current_schedule_still_viable: bool
    can_recover_without_rebuild: bool
    should_offer_rebuild: bool
    recommended_action: str
    recommended_recovery_mode: str | None
    is_ready_for_schedule_generation: bool
    is_ready_for_force_regeneration: bool
    is_ready_for_execution: bool
    base_blockers: list[str] = Field(default_factory=list)
    generation_blockers: list[str] = Field(default_factory=list)
    execution_blockers: list[str] = Field(default_factory=list)


class LearningPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    goal: str
    status: str
    version: int
    current_focus_snapshot: str | None
    weekly_hours_snapshot: int
    schedule_timezone_snapshot: str
    schedule_revision: int
    source_learning_state_snapshot: dict
    plan_summary: dict
    created_at: datetime
    updated_at: datetime
    preference: SchedulingPreferenceResponse | None = None
    courses: list[LearningPlanCourseResponse] = Field(default_factory=list)
