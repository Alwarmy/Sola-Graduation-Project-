from collections import deque, defaultdict
from datetime import date
from sqlalchemy.orm import Session, selectinload

from app.core.concurrency import assert_expected_schedule_revision, assert_expected_version
from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.core.timezone_utils import get_local_date, resolve_effective_timezone
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_course import LearningPlanCourse
from app.models.learning_plan_item import LearningPlanItem
from app.models.scheduling_preference import SchedulingPreference
from app.schemas.learning_plan import PACE_MODE_OPTIONS, STUDY_DAY_OPTIONS, TIME_WINDOW_OPTIONS
from app.schemas.plan_recovery import RECOVERY_MODE_OPTIONS
from app.services.course_structure_service import build_course_structure, get_course_structure_by_course_id
from app.services.plan_execution_service import build_plan_execution_summary
from app.services.plan_scheduling_engine import (
    GeneratedSegment,
    generate_schedule_items_payload,
    split_course_unit_into_segments,
)


def _get_plan_with_context(db: Session, user_id: int, plan_id: int) -> LearningPlan | None:
    return (
        db.query(LearningPlan)
        .options(
            selectinload(LearningPlan.preference),
            selectinload(LearningPlan.courses),
            selectinload(LearningPlan.items),
        )
        .filter(LearningPlan.user_id == user_id)
        .filter(LearningPlan.id == plan_id)
        .first()
    )


def _validate_recovery_preferences(
    preferred_time_window: str,
    preferred_study_days: list[str],
    max_daily_minutes: int,
    session_cap_minutes: int,
    pace_mode: str,
) -> None:
    if preferred_time_window not in TIME_WINDOW_OPTIONS:
        raise ValidationException("Invalid preferred_time_window.")

    invalid_days = [day for day in preferred_study_days if day not in STUDY_DAY_OPTIONS]
    if invalid_days:
        raise ValidationException("Invalid preferred_study_days.")

    if not 30 <= max_daily_minutes <= 180:
        raise ValidationException("max_daily_minutes must be between 30 and 180.")

    if not 15 <= session_cap_minutes <= 45:
        raise ValidationException("session_cap_minutes must be between 15 and 45.")

    if max_daily_minutes < session_cap_minutes:
        raise ValidationException("max_daily_minutes cannot be less than session_cap_minutes.")

    if pace_mode not in PACE_MODE_OPTIONS:
        raise ValidationException("Invalid pace_mode.")


def _normalize_lighten_load_minutes(current_max_daily_minutes: int) -> int:
    reduced = int(current_max_daily_minutes * 0.75)
    if reduced < 60:
        reduced = 60
    if reduced > current_max_daily_minutes:
        reduced = current_max_daily_minutes
    return reduced


def build_plan_recovery_preview_from_plan(
    plan: LearningPlan,
    preference: SchedulingPreference | None,
    plan_items: list[LearningPlanItem],
) -> dict:
    schedule_timezone_snapshot = resolve_effective_timezone(plan.schedule_timezone_snapshot)

    pending_items = [item for item in plan_items if item.status == "pending"]
    in_progress_items = [item for item in plan_items if item.status == "in_progress"]

    local_today = get_local_date(schedule_timezone_snapshot)

    overdue_items = [item for item in pending_items if item.scheduled_date < local_today]
    due_today_items = [item for item in pending_items if item.scheduled_date == local_today]

    overdue_minutes = sum(item.planned_minutes for item in overdue_items)
    remaining_pending_minutes = sum(item.planned_minutes for item in pending_items)
    missed_study_slots_count = len({item.scheduled_date for item in overdue_items})

    max_daily_minutes = preference.max_daily_minutes if preference else 0
    available_capacity_next_7_study_slots_minutes = max_daily_minutes * 7 if max_daily_minutes else 0

    if available_capacity_next_7_study_slots_minutes > 0:
        recovery_pressure_ratio = round(
            overdue_minutes / available_capacity_next_7_study_slots_minutes,
            4,
        )
    else:
        recovery_pressure_ratio = 0.0

    if not overdue_items:
        drift_level = "on_track"
        needs_recovery = False
        current_schedule_still_viable = True
        can_recover_without_rebuild = True
        should_offer_rebuild = False
        recommended_action = "stay_on_track"
        recommended_recovery_mode = None
    else:
        needs_recovery = True

        if (
            missed_study_slots_count <= 2
            and recovery_pressure_ratio < 0.35
            and overdue_minutes <= max_daily_minutes
        ):
            drift_level = "minor_drift"
            current_schedule_still_viable = True
            can_recover_without_rebuild = True
            should_offer_rebuild = True
            recommended_action = "stay_on_track"
            recommended_recovery_mode = "rebalance"
        elif (
            missed_study_slots_count <= 4
            and recovery_pressure_ratio < 0.85
        ):
            drift_level = "moderate_drift"
            current_schedule_still_viable = True
            can_recover_without_rebuild = True
            should_offer_rebuild = True
            recommended_action = "rebuild"
            recommended_recovery_mode = "rebalance"
        else:
            drift_level = "severe_drift"
            current_schedule_still_viable = False
            can_recover_without_rebuild = False
            should_offer_rebuild = True
            recommended_action = "rebuild"
            recommended_recovery_mode = "recover_overdue_first"

    available_actions = ["stay_on_track"]
    available_recovery_modes = list(sorted(RECOVERY_MODE_OPTIONS)) if should_offer_rebuild else []

    return {
        "plan_id": plan.id,
        "plan_version": plan.version,
        "plan_status": plan.status,
        "schedule_timezone_snapshot": schedule_timezone_snapshot,
        "schedule_revision": plan.schedule_revision,
        "missed_study_slots_count": missed_study_slots_count,
        "overdue_items_count": len(overdue_items),
        "overdue_minutes": overdue_minutes,
        "due_today_items_count": len(due_today_items),
        "remaining_pending_items_count": len(pending_items),
        "remaining_pending_minutes": remaining_pending_minutes,
        "in_progress_items_count": len(in_progress_items),
        "available_capacity_next_7_study_slots_minutes": available_capacity_next_7_study_slots_minutes,
        "recovery_pressure_ratio": recovery_pressure_ratio,
        "drift_level": drift_level,
        "needs_recovery": needs_recovery,
        "current_schedule_still_viable": current_schedule_still_viable,
        "can_recover_without_rebuild": can_recover_without_rebuild,
        "should_offer_rebuild": should_offer_rebuild,
        "recommended_action": recommended_action,
        "recommended_recovery_mode": recommended_recovery_mode,
        "available_actions": available_actions,
        "available_recovery_modes": available_recovery_modes,
    }


def get_plan_recovery_preview(
    db: Session,
    user_id: int,
    plan_id: int,
) -> dict:
    plan = _get_plan_with_context(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    if plan.preference is None:
        raise NotFoundException("Scheduling preference not found.")

    return build_plan_recovery_preview_from_plan(
        plan=plan,
        preference=plan.preference,
        plan_items=list(plan.items),
    )


def _assert_plan_ready_for_recovery(plan: LearningPlan) -> None:
    if plan.status != "active":
        raise ConflictException("Learning plan must be active for recovery.")

    if not plan.items:
        raise ConflictException("Learning plan does not contain schedule items.")

    if not any(item.status == "pending" for item in plan.items):
        raise ConflictException("Learning plan has no pending items to recover.")


def _resolve_effective_recovery_preferences(
    preference: SchedulingPreference,
    *,
    mode: str,
    preferred_time_window: str | None,
    pace_mode: str | None,
    preferred_study_days: list[str],
    max_daily_minutes: int | None,
    session_cap_minutes: int | None,
    temporary_note: str | None,
) -> dict:
    effective_preferred_time_window = preferred_time_window or preference.preferred_time_window
    effective_preferred_study_days = preferred_study_days or list(preference.preferred_study_days)
    effective_session_cap_minutes = session_cap_minutes or preference.session_cap_minutes
    effective_temporary_note = temporary_note if temporary_note is not None else preference.temporary_note

    if mode == "lighten_load":
        effective_max_daily_minutes = (
            max_daily_minutes
            if max_daily_minutes is not None
            else _normalize_lighten_load_minutes(preference.max_daily_minutes)
        )
        effective_pace_mode = pace_mode or "relaxed"
    else:
        effective_max_daily_minutes = (
            max_daily_minutes if max_daily_minutes is not None else preference.max_daily_minutes
        )
        effective_pace_mode = pace_mode or preference.pace_mode

    _validate_recovery_preferences(
        preferred_time_window=effective_preferred_time_window,
        preferred_study_days=effective_preferred_study_days,
        max_daily_minutes=effective_max_daily_minutes,
        session_cap_minutes=effective_session_cap_minutes,
        pace_mode=effective_pace_mode,
    )

    return {
        "preferred_time_window": effective_preferred_time_window,
        "preferred_study_days": effective_preferred_study_days,
        "max_daily_minutes": effective_max_daily_minutes,
        "session_cap_minutes": effective_session_cap_minutes,
        "pace_mode": effective_pace_mode,
        "temporary_note": effective_temporary_note,
    }


def _ensure_structures_built_for_plan_courses(
    db: Session,
    plan_courses: list[LearningPlanCourse],
) -> dict[int, object]:
    structures: dict[int, object] = {}

    for plan_course in plan_courses:
        structure = get_course_structure_by_course_id(db=db, course_id=plan_course.course_id)
        if not structure or structure.build_status != "built":
            structure = build_course_structure(
                db=db,
                course_id=plan_course.course_id,
                force_rebuild=False,
            )

        if structure.build_status != "built":
            raise ValidationException(f"Course structure is not ready for course_id={plan_course.course_id}.")

        structures[plan_course.id] = structure

    return structures


def _build_pending_segment_queues_for_recovery(
    *,
    plan: LearningPlan,
    plan_courses: list[LearningPlanCourse],
    structures_by_plan_course_id: dict[int, object],
    pending_items: list[LearningPlanItem],
    locked_items: list[LearningPlanItem],
    session_cap_minutes: int,
    mode: str,
    local_today: date,
) -> dict[int, deque[GeneratedSegment]]:
    locked_keys = {
        (item.plan_course_id, item.course_unit_id, item.segment_index)
        for item in locked_items
    }

    pending_priority_map: dict[tuple[int, int, int], int] = {}
    if mode == "recover_overdue_first":
        for item in pending_items:
            key = (item.plan_course_id, item.course_unit_id, item.segment_index)
            if item.scheduled_date < local_today:
                pending_priority_map[key] = 0
            elif item.scheduled_date == local_today:
                pending_priority_map[key] = 1
            else:
                pending_priority_map[key] = 2

    segment_queues: dict[int, deque[GeneratedSegment]] = {}

    for plan_course in plan_courses:
        structure = structures_by_plan_course_id[plan_course.id]
        raw_segments: list[GeneratedSegment] = []

        ordered_units = sorted(structure.units, key=lambda unit: unit.source_order_index)

        for course_unit in ordered_units:
            unit_segments = split_course_unit_into_segments(
                course_unit=course_unit,
                session_cap_minutes=session_cap_minutes,
            )

            for segment in unit_segments:
                segment.plan_course_id = plan_course.id
                segment.course_id = plan_course.course_id

                segment_key = (
                    segment.plan_course_id,
                    segment.course_unit_id,
                    segment.segment_index,
                )

                if segment_key in locked_keys:
                    continue

                raw_segments.append(segment)

        if mode == "recover_overdue_first":
            raw_segments.sort(
                key=lambda segment: (
                    pending_priority_map.get(
                        (segment.plan_course_id, segment.course_unit_id, segment.segment_index),
                        2,
                    ),
                    segment.source_order_index,
                    segment.segment_index,
                )
            )
        else:
            raw_segments.sort(
                key=lambda segment: (
                    segment.source_order_index,
                    segment.segment_index,
                )
            )

        segment_queues[plan_course.id] = deque(raw_segments)

    return segment_queues


def _build_fixed_reserved_minutes_by_date(
    in_progress_items: list[LearningPlanItem],
    local_today: date,
) -> dict[date, int]:
    reserved: dict[date, int] = defaultdict(int)

    for item in in_progress_items:
        reserved_date = item.scheduled_date if item.scheduled_date >= local_today else local_today
        reserved[reserved_date] += item.planned_minutes

    return dict(reserved)


def apply_plan_recovery(
    db: Session,
    user_id: int,
    plan_id: int,
    *,
    mode: str,
    expected_version: int,
    expected_schedule_revision: int,
    preferred_time_window: str | None,
    pace_mode: str | None,
    preferred_study_days: list[str],
    max_daily_minutes: int | None,
    session_cap_minutes: int | None,
    temporary_note: str | None,
    recovery_note: str | None,
) -> dict:
    if mode not in RECOVERY_MODE_OPTIONS:
        raise ValidationException("Invalid recovery mode.")

    plan = _get_plan_with_context(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    if plan.preference is None:
        raise NotFoundException("Scheduling preference not found.")

    assert_expected_version(
        resource_name="learning_plan",
        expected_version=expected_version,
        current_version=plan.version,
    )
    assert_expected_schedule_revision(
        expected_schedule_revision=expected_schedule_revision,
        current_schedule_revision=plan.schedule_revision,
    )

    _assert_plan_ready_for_recovery(plan)

    preview_before = build_plan_recovery_preview_from_plan(
        plan=plan,
        preference=plan.preference,
        plan_items=list(plan.items),
    )

    effective_preferences = _resolve_effective_recovery_preferences(
        preference=plan.preference,
        mode=mode,
        preferred_time_window=preferred_time_window,
        pace_mode=pace_mode,
        preferred_study_days=preferred_study_days,
        max_daily_minutes=max_daily_minutes,
        session_cap_minutes=session_cap_minutes,
        temporary_note=temporary_note,
    )

    schedule_timezone_snapshot = resolve_effective_timezone(plan.schedule_timezone_snapshot)
    local_today = get_local_date(schedule_timezone_snapshot)

    completed_items = [item for item in plan.items if item.status == "completed"]
    skipped_items = [item for item in plan.items if item.status == "skipped"]
    in_progress_items = [item for item in plan.items if item.status == "in_progress"]
    pending_items = [item for item in plan.items if item.status == "pending"]

    locked_items = completed_items + skipped_items + in_progress_items
    preserved_completed_items_count = len(completed_items)
    preserved_skipped_items_count = len(skipped_items)
    preserved_in_progress_items_count = len(in_progress_items)

    plan_courses = sorted(plan.courses, key=lambda item: (item.order_index, item.id))
    structures_by_plan_course_id = _ensure_structures_built_for_plan_courses(
        db=db,
        plan_courses=plan_courses,
    )

    segment_queues = _build_pending_segment_queues_for_recovery(
        plan=plan,
        plan_courses=plan_courses,
        structures_by_plan_course_id=structures_by_plan_course_id,
        pending_items=pending_items,
        locked_items=locked_items,
        session_cap_minutes=effective_preferences["session_cap_minutes"],
        mode=mode,
        local_today=local_today,
    )

    fixed_reserved_minutes_by_date = _build_fixed_reserved_minutes_by_date(
        in_progress_items=in_progress_items,
        local_today=local_today,
    )

    db.query(LearningPlanItem).filter(
        LearningPlanItem.plan_id == plan.id,
        LearningPlanItem.status == "pending",
    ).delete(synchronize_session=False)

    plan.schedule_revision += 1
    plan.version += 1

    plan.preference.preferred_time_window = effective_preferences["preferred_time_window"]
    plan.preference.preferred_study_days = effective_preferences["preferred_study_days"]
    plan.preference.max_daily_minutes = effective_preferences["max_daily_minutes"]
    plan.preference.session_cap_minutes = effective_preferences["session_cap_minutes"]
    plan.preference.pace_mode = effective_preferences["pace_mode"]
    plan.preference.temporary_note = effective_preferences["temporary_note"]

    initial_order_index = max((item.schedule_order_index for item in locked_items), default=0) + 1

    generated_items_payload = generate_schedule_items_payload(
        plan_id=plan.id,
        ordered_plan_course_ids=[plan_course.id for plan_course in plan_courses],
        segment_queues=segment_queues,
        preferred_study_days=effective_preferences["preferred_study_days"],
        preferred_time_window=effective_preferences["preferred_time_window"],
        max_daily_minutes=effective_preferences["max_daily_minutes"],
        schedule_timezone_snapshot=schedule_timezone_snapshot,
        schedule_revision=plan.schedule_revision,
        fixed_reserved_minutes_by_date=fixed_reserved_minutes_by_date,
        initial_order_index=initial_order_index,
        start_date=local_today,
        extra_item_metadata={
            "recovery_mode": mode,
            "recovery_note": recovery_note,
            "recovered_from_revision": plan.schedule_revision - 1,
        },
    )

    for payload in generated_items_payload:
        db.add(LearningPlanItem(**payload))

    from app.services.plan_service import refresh_plan_summary

    db.flush()
    refresh_plan_summary(db=db, plan=plan)
    db.commit()

    updated_plan = _get_plan_with_context(db=db, user_id=user_id, plan_id=plan.id)
    execution_summary_after = build_plan_execution_summary(
        plan=updated_plan,
        plan_items=list(updated_plan.items),
    )

    pending_items_after = [item for item in updated_plan.items if item.status == "pending"]
    scheduled_dates_after = [item.scheduled_date for item in pending_items_after]

    return {
        "plan_id": updated_plan.id,
        "plan_version": updated_plan.version,
        "schedule_revision": updated_plan.schedule_revision,
        "recovery_mode": mode,
        "recovery_note": recovery_note,
        "rebuilt_pending_items_count": len(pending_items_after),
        "preserved_completed_items_count": preserved_completed_items_count,
        "preserved_skipped_items_count": preserved_skipped_items_count,
        "preserved_in_progress_items_count": preserved_in_progress_items_count,
        "new_scheduled_start_date": min(scheduled_dates_after) if scheduled_dates_after else None,
        "new_scheduled_end_date": max(scheduled_dates_after) if scheduled_dates_after else None,
        "recovery_preview_before": preview_before,
        "execution_summary_after": execution_summary_after,
    }
    
