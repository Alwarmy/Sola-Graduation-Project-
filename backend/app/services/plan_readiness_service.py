from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.core.timezone_utils import resolve_effective_timezone
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_course import LearningPlanCourse
from app.models.learning_plan_item import LearningPlanItem
from app.models.schedule_queue_item import ScheduleQueueItem
from app.models.scheduling_preference import SchedulingPreference
from app.schemas.learning_plan import LearningPlanReadinessResponse
from app.services.plan_execution_service import build_plan_execution_summary
from app.services.plan_shared import (
    MAX_ACTIVE_PLAN_COURSES,
    OPEN_PLAN_STATUSES,
    get_learning_plan_by_id,
    get_plan_courses,
    get_plan_preference,
)


def _build_schedule_stats(
    plan_items: list[LearningPlanItem],
) -> dict:
    if not plan_items:
        return {
            "has_schedule_items": False,
            "schedule_total_items": 0,
            "schedule_total_minutes": 0,
            "scheduled_start_date": None,
            "scheduled_end_date": None,
            "schedule_last_generated_at": None,
        }

    scheduled_dates = [
        item.scheduled_date
        for item in plan_items
        if item.scheduled_date is not None
    ]

    timestamp_candidates = [
        timestamp
        for item in plan_items
        for timestamp in (item.updated_at, item.created_at)
        if timestamp is not None
    ]

    latest_timestamp = max(timestamp_candidates) if timestamp_candidates else None

    return {
        "has_schedule_items": True,
        "schedule_total_items": len(plan_items),
        "schedule_total_minutes": sum(item.planned_minutes for item in plan_items),
        "scheduled_start_date": min(scheduled_dates).isoformat() if scheduled_dates else None,
        "scheduled_end_date": max(scheduled_dates).isoformat() if scheduled_dates else None,
        "schedule_last_generated_at": latest_timestamp.isoformat() if latest_timestamp else None,
    }


def build_plan_readiness_summary(
    plan: LearningPlan,
    preference: SchedulingPreference | None,
    plan_courses: list[LearningPlanCourse],
    plan_items: list[LearningPlanItem],
    queued_backlog_count: int,
    scheduled_queue_count: int,
) -> dict:
    from app.services.plan_recovery_service import build_plan_recovery_preview_from_plan

    schedule_stats = _build_schedule_stats(plan_items)
    schedule_timezone_snapshot = resolve_effective_timezone(plan.schedule_timezone_snapshot)
    execution_summary = build_plan_execution_summary(plan=plan, plan_items=plan_items)
    recovery_preview = build_plan_recovery_preview_from_plan(
        plan=plan,
        preference=preference,
        plan_items=plan_items,
    )

    is_open_status = plan.status in OPEN_PLAN_STATUSES
    is_active_status = plan.status == "active"
    has_preference = preference is not None
    has_courses = len(plan_courses) > 0

    preferred_study_days_count = len(preference.preferred_study_days or []) if preference else 0
    max_daily_minutes = preference.max_daily_minutes if preference else None
    session_cap_minutes = preference.session_cap_minutes if preference else None

    base_blockers: list[str] = []

    if plan.status == "paused":
        base_blockers.append("plan_paused")
    elif plan.status != "active":
        base_blockers.append("plan_not_active")

    if not has_preference:
        base_blockers.append("missing_preference")
    if not has_courses:
        base_blockers.append("no_active_courses")
    if len(plan_courses) > MAX_ACTIVE_PLAN_COURSES:
        base_blockers.append("too_many_active_courses")
    if has_preference and preferred_study_days_count == 0:
        base_blockers.append("missing_study_days")
    if (
        has_preference
        and max_daily_minutes is not None
        and session_cap_minutes is not None
        and max_daily_minutes < session_cap_minutes
    ):
        base_blockers.append("invalid_daily_session_caps")

    generation_blockers = list(base_blockers)
    if schedule_stats["has_schedule_items"]:
        generation_blockers.append("schedule_already_generated")

    execution_blockers = list(base_blockers)
    if not schedule_stats["has_schedule_items"]:
        execution_blockers.append("schedule_not_generated")
    if execution_summary["pending_items_count"] + execution_summary["in_progress_items_count"] == 0:
        execution_blockers.append("no_actionable_items")

    is_ready_for_schedule_generation = len(generation_blockers) == 0
    is_ready_for_force_regeneration = len(base_blockers) == 0 and schedule_stats["has_schedule_items"]
    is_ready_for_execution = len(execution_blockers) == 0

    return {
        "plan_id": plan.id,
        "version": plan.version,
        "status": plan.status,
        "schedule_timezone_snapshot": schedule_timezone_snapshot,
        "schedule_revision": plan.schedule_revision,
        "is_open_status": is_open_status,
        "is_active_status": is_active_status,
        "has_preference": has_preference,
        "has_courses": has_courses,
        "has_schedule_items": schedule_stats["has_schedule_items"],
        "active_course_count": len(plan_courses),
        "max_active_courses": MAX_ACTIVE_PLAN_COURSES,
        "queued_backlog_count": queued_backlog_count,
        "scheduled_queue_count": scheduled_queue_count,
        "preferred_time_window": preference.preferred_time_window if preference else None,
        "pace_mode": preference.pace_mode if preference else None,
        "preferred_study_days_count": preferred_study_days_count,
        "max_daily_minutes": max_daily_minutes,
        "session_cap_minutes": session_cap_minutes,
        "schedule_total_items": schedule_stats["schedule_total_items"],
        "schedule_total_minutes": schedule_stats["schedule_total_minutes"],
        "scheduled_start_date": schedule_stats["scheduled_start_date"],
        "scheduled_end_date": schedule_stats["scheduled_end_date"],
        "schedule_last_generated_at": schedule_stats["schedule_last_generated_at"],
        "pending_items_count": execution_summary["pending_items_count"],
        "in_progress_items_count": execution_summary["in_progress_items_count"],
        "completed_items_count": execution_summary["completed_items_count"],
        "skipped_items_count": execution_summary["skipped_items_count"],
        "overdue_items_count": execution_summary["overdue_items_count"],
        "due_today_items_count": execution_summary["due_today_items_count"],
        "completion_rate": execution_summary["completion_rate"],
        "is_plan_finished": execution_summary["is_plan_finished"],
        "can_mark_completed": execution_summary["can_mark_completed"],
        "next_actionable_item_id": execution_summary["next_actionable_item_id"],
        "next_actionable_scheduled_date": execution_summary["next_actionable_scheduled_date"],
        "next_actionable_title": execution_summary["next_actionable_title"],
        "missed_study_slots_count": recovery_preview["missed_study_slots_count"],
        "overdue_minutes": recovery_preview["overdue_minutes"],
        "remaining_pending_items_count": recovery_preview["remaining_pending_items_count"],
        "remaining_pending_minutes": recovery_preview["remaining_pending_minutes"],
        "available_capacity_next_7_study_slots_minutes": recovery_preview["available_capacity_next_7_study_slots_minutes"],
        "recovery_pressure_ratio": recovery_preview["recovery_pressure_ratio"],
        "drift_level": recovery_preview["drift_level"],
        "needs_recovery": recovery_preview["needs_recovery"],
        "current_schedule_still_viable": recovery_preview["current_schedule_still_viable"],
        "can_recover_without_rebuild": recovery_preview["can_recover_without_rebuild"],
        "should_offer_rebuild": recovery_preview["should_offer_rebuild"],
        "recommended_action": recovery_preview["recommended_action"],
        "recommended_recovery_mode": recovery_preview["recommended_recovery_mode"],
        "is_ready_for_schedule_generation": is_ready_for_schedule_generation,
        "is_ready_for_force_regeneration": is_ready_for_force_regeneration,
        "is_ready_for_execution": is_ready_for_execution,
        "base_blockers": base_blockers,
        "generation_blockers": generation_blockers,
        "execution_blockers": execution_blockers,
    }


def refresh_plan_summary(
    db: Session,
    plan: LearningPlan,
) -> None:
    preference = get_plan_preference(db=db, plan_id=plan.id)
    plan_courses = get_plan_courses(db=db, plan_id=plan.id)
    plan_items = (
        db.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == plan.id)
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .all()
    )

    queued_backlog_count = (
        db.query(ScheduleQueueItem)
        .filter(ScheduleQueueItem.user_id == plan.user_id)
        .filter(ScheduleQueueItem.status == "queued")
        .count()
    )
    scheduled_queue_count = (
        db.query(ScheduleQueueItem)
        .filter(ScheduleQueueItem.user_id == plan.user_id)
        .filter(ScheduleQueueItem.status == "scheduled")
        .count()
    )

    plan.plan_summary = build_plan_readiness_summary(
        plan=plan,
        preference=preference,
        plan_courses=plan_courses,
        plan_items=plan_items,
        queued_backlog_count=queued_backlog_count,
        scheduled_queue_count=scheduled_queue_count,
    )

    db.flush()


def get_learning_plan_readiness(
    db: Session,
    user_id: int,
    plan_id: int,
) -> LearningPlanReadinessResponse:
    plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    refresh_plan_summary(db=db, plan=plan)
    db.commit()
    db.refresh(plan)

    return LearningPlanReadinessResponse(**plan.plan_summary)
