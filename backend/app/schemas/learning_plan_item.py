from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.domain_values import LEARNING_PLAN_ITEM_STATUS_VALUES
from app.schemas.course import CourseResponse
from app.schemas.course_structure import CourseUnitResponse


ITEM_STATUS_OPTIONS = set(LEARNING_PLAN_ITEM_STATUS_VALUES)


class LearningPlanItemCompleteRequest(BaseModel):
    actual_minutes: int | None = Field(default=None, ge=1, le=720)
    expected_version: int = Field(..., ge=1)


class LearningPlanItemSkipRequest(BaseModel):
    skip_reason: str | None = Field(default=None, min_length=1, max_length=300)
    expected_version: int = Field(..., ge=1)


class LearningPlanItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    plan_course_id: int
    course_id: int
    course_unit_id: int
    title: str
    item_type: str
    status: str
    version: int
    schedule_order_index: int
    source_order_index: int
    scheduled_date: date
    time_window: str
    planned_minutes: int
    actual_started_at: datetime | None
    actual_completed_at: datetime | None
    actual_minutes: int | None
    skipped_at: datetime | None
    skip_reason: str | None
    segment_index: int
    segment_start_second: int | None
    segment_end_second: int | None
    practical_signal: str
    load_signal: str
    schedule_timezone_snapshot: str
    is_due_today: bool
    is_overdue: bool
    is_actionable: bool
    item_metadata: dict
    created_at: datetime
    updated_at: datetime
    course: CourseResponse
    course_unit: CourseUnitResponse


class PlanExecutionSummaryResponse(BaseModel):
    plan_id: int
    plan_status: str
    schedule_timezone_snapshot: str
    total_items: int
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


class LearningPlanItemActionResultResponse(BaseModel):
    item: LearningPlanItemResponse
    execution_summary: PlanExecutionSummaryResponse


class PlanScheduleGenerateResponse(BaseModel):
    plan_id: int
    plan_version: int
    schedule_revision: int
    total_items: int
    total_minutes: int
    scheduled_start_date: date | None
    scheduled_end_date: date | None
    items: list[LearningPlanItemResponse] = Field(default_factory=list)


class PlanScheduleGenerateRequest(BaseModel):
    force_rebuild: bool = False
    expected_version: int = Field(..., ge=1)
    expected_schedule_revision: int | None = Field(default=None, ge=1)
