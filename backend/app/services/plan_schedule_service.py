from __future__ import annotations

from collections import deque

from sqlalchemy.orm import Session, selectinload

from app.core.concurrency import assert_expected_schedule_revision, assert_expected_version
from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.core.timezone_utils import resolve_effective_timezone
from app.models.course_structure import CourseStructure
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_course import LearningPlanCourse
from app.models.learning_plan_item import LearningPlanItem
from app.services.course_structure_service import build_course_structure, get_course_structure_by_course_id
from app.services.plan_execution_service import serialize_learning_plan_item
from app.services.plan_scheduling_engine import (
    GeneratedSegment,
    generate_schedule_items_payload,
    split_course_unit_into_segments,
)
from app.services.plan_service import (
    get_learning_plan_by_id,
    get_learning_plan_readiness,
    get_plan_courses,
    get_plan_preference,
    refresh_plan_summary,
)


def _get_plan_with_items(db: Session, user_id: int, plan_id: int) -> LearningPlan | None:
    return (
        db.query(LearningPlan)
        .options(
            selectinload(LearningPlan.items).selectinload(LearningPlanItem.course),
            selectinload(LearningPlan.items).selectinload(LearningPlanItem.course_unit),
        )
        .filter(LearningPlan.user_id == user_id)
        .filter(LearningPlan.id == plan_id)
        .first()
    )


def list_plan_items(
    db: Session,
    user_id: int,
    plan_id: int,
) -> list[LearningPlanItem]:
    plan = _get_plan_with_items(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")
    return list(plan.items)


def get_plan_schedule_summary(
    db: Session,
    user_id: int,
    plan_id: int,
) -> dict:
    plan = _get_plan_with_items(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    items = list(plan.items)
    total_minutes = sum(item.planned_minutes for item in items)
    scheduled_dates = [item.scheduled_date for item in items]

    return {
        "plan_id": plan.id,
        "plan_version": plan.version,
        "schedule_revision": plan.schedule_revision,
        "total_items": len(items),
        "total_minutes": total_minutes,
        "scheduled_start_date": min(scheduled_dates) if scheduled_dates else None,
        "scheduled_end_date": max(scheduled_dates) if scheduled_dates else None,
        "items": [serialize_learning_plan_item(plan, item) for item in items],
    }


def _format_blockers(blockers: list[str]) -> str:
    return ", ".join(blockers) if blockers else "unknown_blocker"


def _ensure_plan_ready_for_schedule_generation(
    db: Session,
    user_id: int,
    plan_id: int,
    force_rebuild: bool,
) -> None:
    readiness = get_learning_plan_readiness(db=db, user_id=user_id, plan_id=plan_id)

    if force_rebuild and readiness.has_schedule_items:
        if not readiness.is_ready_for_force_regeneration:
            raise ConflictException(
                "Learning plan is not ready for force regeneration: "
                f"{_format_blockers(readiness.base_blockers)}."
            )
        return

    if not readiness.is_ready_for_schedule_generation:
        raise ConflictException(
            "Learning plan is not ready for schedule generation: "
            f"{_format_blockers(readiness.generation_blockers)}."
        )


def _ensure_structures_built_for_plan_courses(
    db: Session,
    plan_courses: list[LearningPlanCourse],
) -> dict[int, CourseStructure]:
    structures: dict[int, CourseStructure] = {}

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


def _build_course_segment_queues(
    plan_courses: list[LearningPlanCourse],
    structures_by_plan_course_id: dict[int, CourseStructure],
    session_cap_minutes: int,
) -> dict[int, deque[GeneratedSegment]]:
    segment_queues: dict[int, deque[GeneratedSegment]] = {}

    for plan_course in plan_courses:
        structure = structures_by_plan_course_id[plan_course.id]
        course_queue: deque[GeneratedSegment] = deque()

        ordered_units = sorted(structure.units, key=lambda unit: unit.source_order_index)

        for course_unit in ordered_units:
            unit_segments = split_course_unit_into_segments(
                course_unit=course_unit,
                session_cap_minutes=session_cap_minutes,
            )

            for segment in unit_segments:
                segment.plan_course_id = plan_course.id
                segment.course_id = plan_course.course_id
                course_queue.append(segment)

        segment_queues[plan_course.id] = course_queue

    return segment_queues


def generate_initial_plan_schedule(
    db: Session,
    user_id: int,
    plan_id: int,
    *,
    force_rebuild: bool = False,
    expected_version: int,
    expected_schedule_revision: int | None = None,
) -> LearningPlan:
    plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    assert_expected_version(
        resource_name="learning_plan",
        expected_version=expected_version,
        current_version=plan.version,
    )

    if expected_schedule_revision is not None:
        assert_expected_schedule_revision(
            expected_schedule_revision=expected_schedule_revision,
            current_schedule_revision=plan.schedule_revision,
        )

    _ensure_plan_ready_for_schedule_generation(
        db=db,
        user_id=user_id,
        plan_id=plan_id,
        force_rebuild=force_rebuild,
    )

    schedule_timezone_snapshot = resolve_effective_timezone(plan.schedule_timezone_snapshot)

    existing_items = (
        db.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == plan.id)
        .order_by(LearningPlanItem.schedule_order_index.asc())
        .all()
    )

    if existing_items and not force_rebuild:
        raise ConflictException("Schedule items already exist for this learning plan.")

    if existing_items and force_rebuild:
        if any(item.status != "pending" for item in existing_items):
            raise ConflictException("Cannot force regenerate a plan that already contains execution history.")

        db.query(LearningPlanItem).filter(
            LearningPlanItem.plan_id == plan.id
        ).delete(synchronize_session=False)
        db.flush()

        plan.schedule_revision += 1

    preference = get_plan_preference(db=db, plan_id=plan.id)
    if not preference:
        raise NotFoundException("Scheduling preference not found.")

    plan_courses = get_plan_courses(db=db, plan_id=plan.id)
    if not plan_courses:
        raise ValidationException("Learning plan does not contain any active courses.")

    structures_by_plan_course_id = _ensure_structures_built_for_plan_courses(
        db=db,
        plan_courses=plan_courses,
    )

    segment_queues = _build_course_segment_queues(
        plan_courses=plan_courses,
        structures_by_plan_course_id=structures_by_plan_course_id,
        session_cap_minutes=preference.session_cap_minutes,
    )

    generated_items_payload = generate_schedule_items_payload(
        plan_id=plan.id,
        ordered_plan_course_ids=[plan_course.id for plan_course in plan_courses],
        segment_queues=segment_queues,
        preferred_study_days=preference.preferred_study_days,
        preferred_time_window=preference.preferred_time_window,
        max_daily_minutes=preference.max_daily_minutes,
        schedule_timezone_snapshot=schedule_timezone_snapshot,
        schedule_revision=getattr(plan, "schedule_revision", 1),
    )

    for payload in generated_items_payload:
        db.add(LearningPlanItem(**payload))

    plan.version += 1
    db.flush()
    refresh_plan_summary(db=db, plan=plan)
    db.commit()

    generated_plan = _get_plan_with_items(db=db, user_id=user_id, plan_id=plan.id)
    return generated_plan
