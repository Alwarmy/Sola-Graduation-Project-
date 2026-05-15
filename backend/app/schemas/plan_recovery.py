from datetime import date
from pydantic import BaseModel, Field


RECOVERY_MODE_OPTIONS = {
    "rebalance",
    "recover_overdue_first",
    "lighten_load",
}

RECOVERY_ACTION_OPTIONS = {
    "stay_on_track",
    "rebuild",
}

DRIFT_LEVEL_OPTIONS = {
    "on_track",
    "minor_drift",
    "moderate_drift",
    "severe_drift",
}


class PlanRecoveryPreviewResponse(BaseModel):
    plan_id: int
    plan_version: int
    plan_status: str
    schedule_timezone_snapshot: str
    schedule_revision: int

    missed_study_slots_count: int
    overdue_items_count: int
    overdue_minutes: int
    due_today_items_count: int

    remaining_pending_items_count: int
    remaining_pending_minutes: int
    in_progress_items_count: int

    available_capacity_next_7_study_slots_minutes: int
    recovery_pressure_ratio: float

    drift_level: str
    needs_recovery: bool
    current_schedule_still_viable: bool
    can_recover_without_rebuild: bool
    should_offer_rebuild: bool

    recommended_action: str
    recommended_recovery_mode: str | None

    available_actions: list[str] = Field(default_factory=list)
    available_recovery_modes: list[str] = Field(default_factory=list)


class PlanRecoveryApplyRequest(BaseModel):
    mode: str
    expected_version: int = Field(..., ge=1)
    expected_schedule_revision: int = Field(..., ge=1)
    preferred_time_window: str | None = None
    pace_mode: str | None = None
    preferred_study_days: list[str] = Field(default_factory=list)
    max_daily_minutes: int | None = None
    session_cap_minutes: int | None = None
    temporary_note: str | None = None
    recovery_note: str | None = Field(default=None, min_length=1, max_length=400)


class PlanRecoveryApplyResponse(BaseModel):
    plan_id: int
    plan_version: int
    schedule_revision: int
    recovery_mode: str
    recovery_note: str | None

    rebuilt_pending_items_count: int
    preserved_completed_items_count: int
    preserved_skipped_items_count: int
    preserved_in_progress_items_count: int

    new_scheduled_start_date: date | None
    new_scheduled_end_date: date | None

    recovery_preview_before: PlanRecoveryPreviewResponse
    execution_summary_after: dict
