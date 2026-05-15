from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.concurrency import assert_expected_version
from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_course import LearningPlanCourse
from app.models.learning_plan_item import LearningPlanItem
from app.models.schedule_queue_item import ScheduleQueueItem
from app.models.scheduling_preference import SchedulingPreference
from app.schemas.learning_plan import (
    LearningPlanCreateRequest,
    LearningPlanStatusUpdateRequest,
    SchedulingPreferenceUpdateRequest,
)
from app.services.plan_execution_service import build_plan_execution_summary
from app.services.plan_readiness_service import refresh_plan_summary
from app.services.plan_shared import (
    ALLOWED_PLAN_STATUS_TRANSITIONS,
    MAX_ACTIVE_PLAN_COURSES,
    TERMINAL_PLAN_STATUSES,
    assert_plan_is_modifiable,
    build_learning_state_snapshot,
    build_scheduling_preference,
    get_learning_plan_by_id,
    get_open_learning_plan,
    get_plan_courses,
    get_schedule_queue_item,
    get_user_learning_state_for_planning,
    get_user_profile_for_planning,
    is_course_in_any_open_plan,
    normalize_plan_course_order,
    plan_has_schedule_items,
    resolve_plan_timezone,
    validate_preference_values,
    validate_unique_queue_item_ids,
)


def _constraint_name_from_integrity_error(error: IntegrityError) -> str | None:
    original_error = getattr(error, "orig", None)
    diagnostics = getattr(original_error, "diag", None)
    return getattr(diagnostics, "constraint_name", None)


def create_learning_plan(
    db: Session,
    user_id: int,
    payload: LearningPlanCreateRequest,
) -> LearningPlan:
    existing_open_plan = get_open_learning_plan(db=db, user_id=user_id)
    if existing_open_plan:
        raise ConflictException("User already has an open learning plan.")

    if len(payload.queue_item_ids) > MAX_ACTIVE_PLAN_COURSES:
        raise ValidationException("Active plan cannot contain more than 3 courses.")

    validate_unique_queue_item_ids(payload.queue_item_ids)

    profile = get_user_profile_for_planning(db=db, user_id=user_id)
    if not profile:
        raise ValidationException("User profile is required before creating a learning plan.")

    learning_state = get_user_learning_state_for_planning(db=db, user_id=user_id)

    queue_items = (
        db.query(ScheduleQueueItem)
        .filter(ScheduleQueueItem.user_id == user_id)
        .filter(ScheduleQueueItem.id.in_(payload.queue_item_ids))
        .all()
    )

    if len(queue_items) != len(payload.queue_item_ids):
        raise NotFoundException("One or more queue items were not found.")

    if any(item.status != "queued" for item in queue_items):
        raise ConflictException("Only queued items can be used to create a learning plan.")

    learning_state_snapshot = build_learning_state_snapshot(learning_state)
    schedule_timezone_snapshot = resolve_plan_timezone(profile)

    plan = LearningPlan(
        user_id=user_id,
        title=payload.title,
        goal=payload.goal,
        status="active",
        current_focus_snapshot=learning_state.current_focus if learning_state else None,
        weekly_hours_snapshot=profile.weekly_hours,
        schedule_timezone_snapshot=schedule_timezone_snapshot,
        schedule_revision=1,
        source_learning_state_snapshot=learning_state_snapshot,
        plan_summary={},
    )

    db.add(plan)
    db.flush()

    preference = build_scheduling_preference(
        profile=profile,
        plan_id=plan.id,
        preferred_time_window=payload.preferred_time_window,
        pace_mode=payload.pace_mode,
        preferred_study_days=payload.preferred_study_days,
        max_daily_minutes=payload.max_daily_minutes,
        session_cap_minutes=payload.session_cap_minutes,
        temporary_note=payload.temporary_note,
        deadline_date=payload.deadline_date,
    )
    db.add(preference)

    ordered_queue_items = sorted(
        queue_items,
        key=lambda item: payload.queue_item_ids.index(item.id),
    )

    for index, queue_item in enumerate(ordered_queue_items, start=1):
        plan_course = LearningPlanCourse(
            plan_id=plan.id,
            course_id=queue_item.course_id,
            priority=index,
            order_index=index,
            status="active",
            rationale="Selected from schedule queue for the active learning plan.",
        )
        db.add(plan_course)
        queue_item.status = "scheduled"

    refresh_plan_summary(db=db, plan=plan)

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if _constraint_name_from_integrity_error(error) == "uq_learning_plans_one_open_per_user":
            raise ConflictException("User already has an open learning plan.")
        raise

    created_plan = get_learning_plan_by_id(
        db=db,
        user_id=user_id,
        plan_id=plan.id,
    )
    return created_plan


def add_queue_item_to_open_plan(
    db: Session,
    user_id: int,
    plan_id: int,
    queue_item_id: int,
    expected_version: int,
) -> LearningPlan:
    plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    assert_expected_version(
        resource_name="learning_plan",
        expected_version=expected_version,
        current_version=plan.version,
    )
    assert_plan_is_modifiable(plan)

    if plan_has_schedule_items(db=db, plan_id=plan.id):
        raise ConflictException("Cannot modify plan structure after schedule generation. Use the schedule regeneration workflow instead.")

    active_course_count = len(get_plan_courses(db=db, plan_id=plan.id))
    if active_course_count >= MAX_ACTIVE_PLAN_COURSES:
        raise ValidationException("Active plan cannot contain more than 3 courses.")

    queue_item = get_schedule_queue_item(
        db=db,
        user_id=user_id,
        queue_item_id=queue_item_id,
    )
    if not queue_item:
        raise NotFoundException("Schedule queue item not found.")

    if queue_item.status != "queued":
        raise ConflictException("Only queued items can be added into an open learning plan.")

    if is_course_in_any_open_plan(
        db=db,
        user_id=user_id,
        course_id=queue_item.course_id,
        exclude_plan_id=plan.id,
    ):
        raise ConflictException("Course already exists inside another open learning plan.")

    existing_plan_course = (
        db.query(LearningPlanCourse)
        .filter(LearningPlanCourse.plan_id == plan.id)
        .filter(LearningPlanCourse.course_id == queue_item.course_id)
        .first()
    )
    if existing_plan_course:
        raise ConflictException("Course already exists inside the open learning plan.")

    plan_course = LearningPlanCourse(
        plan_id=plan.id,
        course_id=queue_item.course_id,
        priority=active_course_count + 1,
        order_index=active_course_count + 1,
        status="active",
        rationale="Added from schedule queue into the open learning plan.",
    )
    db.add(plan_course)

    queue_item.status = "scheduled"
    plan.version += 1

    refresh_plan_summary(db=db, plan=plan)

    db.commit()

    updated_plan = get_learning_plan_by_id(
        db=db,
        user_id=user_id,
        plan_id=plan.id,
    )
    return updated_plan


def remove_course_from_learning_plan(
    db: Session,
    user_id: int,
    plan_id: int,
    plan_course_id: int,
    expected_version: int,
) -> LearningPlan:
    plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    assert_expected_version(
        resource_name="learning_plan",
        expected_version=expected_version,
        current_version=plan.version,
    )
    assert_plan_is_modifiable(plan)

    if plan_has_schedule_items(db=db, plan_id=plan.id):
        raise ConflictException("Cannot modify plan structure after schedule generation. Use the schedule regeneration workflow instead.")

    plan_courses = get_plan_courses(db=db, plan_id=plan.id)
    if len(plan_courses) <= 1:
        raise ConflictException("Cannot remove the last course from an open learning plan. Archive or complete the plan instead.")

    plan_course = (
        db.query(LearningPlanCourse)
        .filter(LearningPlanCourse.plan_id == plan.id)
        .filter(LearningPlanCourse.id == plan_course_id)
        .first()
    )
    if not plan_course:
        raise NotFoundException("Learning plan course not found.")

    queue_item = (
        db.query(ScheduleQueueItem)
        .filter(ScheduleQueueItem.user_id == user_id)
        .filter(ScheduleQueueItem.course_id == plan_course.course_id)
        .first()
    )
    if queue_item:
        queue_item.status = "queued"

    db.delete(plan_course)
    db.flush()

    normalize_plan_course_order(db=db, plan_id=plan.id)
    plan.version += 1
    refresh_plan_summary(db=db, plan=plan)

    db.commit()

    updated_plan = get_learning_plan_by_id(
        db=db,
        user_id=user_id,
        plan_id=plan.id,
    )
    return updated_plan


def update_scheduling_preference(
    db: Session,
    user_id: int,
    plan_id: int,
    payload: SchedulingPreferenceUpdateRequest,
) -> SchedulingPreference:
    plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    assert_expected_version(
        resource_name="learning_plan",
        expected_version=payload.expected_version,
        current_version=plan.version,
    )
    assert_plan_is_modifiable(plan)

    if plan_has_schedule_items(db=db, plan_id=plan.id):
        raise ConflictException("Cannot modify scheduling preferences after schedule generation. Use the schedule regeneration workflow instead.")

    profile = get_user_profile_for_planning(db=db, user_id=user_id)
    if not profile:
        raise ValidationException("User profile is required before updating scheduling preferences.")

    preference = (
        db.query(SchedulingPreference)
        .filter(SchedulingPreference.plan_id == plan.id)
        .first()
    )
    if not preference:
        raise NotFoundException("Scheduling preference not found.")

    update_data = payload.model_dump(exclude_unset=True)

    next_preferred_time_window = update_data.get("preferred_time_window", preference.preferred_time_window)
    next_pace_mode = update_data.get("pace_mode", preference.pace_mode)
    next_preferred_study_days = update_data.get("preferred_study_days", preference.preferred_study_days)
    next_max_daily_minutes = update_data.get("max_daily_minutes", preference.max_daily_minutes)
    next_session_cap_minutes = update_data.get("session_cap_minutes", preference.session_cap_minutes)

    validate_preference_values(
        preferred_time_window=next_preferred_time_window,
        pace_mode=next_pace_mode,
        preferred_study_days=next_preferred_study_days,
        max_daily_minutes=next_max_daily_minutes,
        session_cap_minutes=next_session_cap_minutes,
    )

    if "preferred_time_window" in update_data:
        preference.preferred_time_window = update_data["preferred_time_window"]
    if "pace_mode" in update_data:
        preference.pace_mode = update_data["pace_mode"]
    if "preferred_study_days" in update_data:
        preference.preferred_study_days = update_data["preferred_study_days"]
    if "max_daily_minutes" in update_data:
        preference.max_daily_minutes = update_data["max_daily_minutes"]
    if "session_cap_minutes" in update_data:
        preference.session_cap_minutes = update_data["session_cap_minutes"]
    if "temporary_note" in update_data:
        preference.temporary_note = update_data["temporary_note"]
    if "deadline_date" in update_data:
        preference.deadline_date = update_data["deadline_date"]

    plan.version += 1
    refresh_plan_summary(db=db, plan=plan)

    db.commit()
    db.refresh(preference)

    return preference


def update_learning_plan_status(
    db: Session,
    user_id: int,
    plan_id: int,
    payload: LearningPlanStatusUpdateRequest,
) -> LearningPlan:
    plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    assert_expected_version(
        resource_name="learning_plan",
        expected_version=payload.expected_version,
        current_version=plan.version,
    )
    new_status = payload.status
    if new_status not in {"active", "paused", "archived", "completed"}:
        raise ValidationException("Invalid learning plan status.")

    current_status = plan.status
    if new_status == current_status:
        return plan

    allowed_targets = ALLOWED_PLAN_STATUS_TRANSITIONS.get(current_status, set())
    if new_status not in allowed_targets:
        raise ValidationException("Invalid learning plan status transition.")

    if new_status == "active":
        existing_open_plan = get_open_learning_plan(
            db=db,
            user_id=user_id,
            exclude_plan_id=plan.id,
        )
        if existing_open_plan:
            raise ConflictException("User already has another open learning plan.")

        if len(get_plan_courses(db=db, plan_id=plan.id)) == 0:
            raise ConflictException("Cannot activate an empty learning plan.")

    if new_status == "completed":
        plan_items = (
            db.query(LearningPlanItem)
            .filter(LearningPlanItem.plan_id == plan.id)
            .order_by(LearningPlanItem.schedule_order_index.asc())
            .all()
        )

        execution_summary = build_plan_execution_summary(
            plan=plan,
            plan_items=plan_items,
        )

        if not execution_summary["can_mark_completed"]:
            raise ConflictException("Cannot complete a learning plan until all items are completed or skipped.")

    plan.status = new_status
    plan.version += 1

    if new_status in TERMINAL_PLAN_STATUSES:
        plan_courses = get_plan_courses(db=db, plan_id=plan.id)
        for plan_course in plan_courses:
            queue_item = (
                db.query(ScheduleQueueItem)
                .filter(ScheduleQueueItem.user_id == user_id)
                .filter(ScheduleQueueItem.course_id == plan_course.course_id)
                .first()
            )
            if queue_item:
                queue_item.status = "queued"

    refresh_plan_summary(db=db, plan=plan)

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if _constraint_name_from_integrity_error(error) == "uq_learning_plans_one_open_per_user":
            raise ConflictException("User already has another open learning plan.")
        raise

    updated_plan = get_learning_plan_by_id(
        db=db,
        user_id=user_id,
        plan_id=plan.id,
    )
    return updated_plan
