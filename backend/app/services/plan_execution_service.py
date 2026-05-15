from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, selectinload

from app.core.concurrency import assert_expected_version
from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.core.timezone_utils import get_local_date, resolve_effective_timezone
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_item import LearningPlanItem
from app.schemas.learning_plan_item import ITEM_STATUS_OPTIONS
from app.services.user_event_service import create_system_user_event


ACTIONABLE_ITEM_STATUSES = {"pending", "in_progress"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _get_plan_with_items(
    db: Session,
    user_id: int,
    plan_id: int,
) -> LearningPlan | None:
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


def _get_plan_item_with_context(
    db: Session,
    plan_id: int,
    item_id: int,
) -> LearningPlanItem | None:
    return (
        db.query(LearningPlanItem)
        .options(
            selectinload(LearningPlanItem.course),
            selectinload(LearningPlanItem.course_unit),
        )
        .filter(LearningPlanItem.plan_id == plan_id)
        .filter(LearningPlanItem.id == item_id)
        .first()
    )


def _assert_plan_is_active_for_execution(plan: LearningPlan) -> None:
    if plan.status != "active":
        raise ConflictException("Learning plan must be active for execution actions.")


def _assert_item_status(
    item: LearningPlanItem,
    allowed_statuses: set[str],
    message: str,
) -> None:
    if item.status not in allowed_statuses:
        raise ConflictException(message)


def is_learning_plan_item_overdue(
    plan: LearningPlan,
    item: LearningPlanItem,
) -> bool:
    if plan.status != "active":
        return False

    if item.status not in ACTIONABLE_ITEM_STATUSES:
        return False

    local_today = get_local_date(resolve_effective_timezone(plan.schedule_timezone_snapshot))
    return item.scheduled_date < local_today


def is_learning_plan_item_due_today(
    plan: LearningPlan,
    item: LearningPlanItem,
) -> bool:
    if plan.status != "active":
        return False

    if item.status not in ACTIONABLE_ITEM_STATUSES:
        return False

    local_today = get_local_date(resolve_effective_timezone(plan.schedule_timezone_snapshot))
    return item.scheduled_date == local_today


def serialize_learning_plan_item(
    plan: LearningPlan,
    item: LearningPlanItem,
) -> dict:
    schedule_timezone_snapshot = resolve_effective_timezone(plan.schedule_timezone_snapshot)

    return {
        "id": item.id,
        "plan_id": item.plan_id,
        "plan_course_id": item.plan_course_id,
        "course_id": item.course_id,
        "course_unit_id": item.course_unit_id,
        "title": item.title,
        "item_type": item.item_type,
        "status": item.status,
        "version": item.version,
        "schedule_order_index": item.schedule_order_index,
        "source_order_index": item.source_order_index,
        "scheduled_date": item.scheduled_date,
        "time_window": item.time_window,
        "planned_minutes": item.planned_minutes,
        "actual_started_at": item.actual_started_at,
        "actual_completed_at": item.actual_completed_at,
        "actual_minutes": item.actual_minutes,
        "skipped_at": item.skipped_at,
        "skip_reason": item.skip_reason,
        "segment_index": item.segment_index,
        "segment_start_second": item.segment_start_second,
        "segment_end_second": item.segment_end_second,
        "practical_signal": item.practical_signal,
        "load_signal": item.load_signal,
        "schedule_timezone_snapshot": schedule_timezone_snapshot,
        "is_due_today": is_learning_plan_item_due_today(plan, item),
        "is_overdue": is_learning_plan_item_overdue(plan, item),
        "is_actionable": plan.status == "active" and item.status in ACTIONABLE_ITEM_STATUSES,
        "item_metadata": item.item_metadata or {},
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "course": item.course,
        "course_unit": item.course_unit,
    }


def build_plan_execution_summary(
    plan: LearningPlan,
    plan_items: list[LearningPlanItem],
) -> dict:
    schedule_timezone_snapshot = resolve_effective_timezone(plan.schedule_timezone_snapshot)

    total_items = len(plan_items)
    pending_items_count = sum(1 for item in plan_items if item.status == "pending")
    in_progress_items_count = sum(1 for item in plan_items if item.status == "in_progress")
    completed_items_count = sum(1 for item in plan_items if item.status == "completed")
    skipped_items_count = sum(1 for item in plan_items if item.status == "skipped")

    actionable_items = [
        item for item in plan_items
        if item.status in ACTIONABLE_ITEM_STATUSES
    ]

    if plan.status == "active":
        local_today = get_local_date(schedule_timezone_snapshot)
        overdue_items = [
            item for item in actionable_items
            if item.scheduled_date < local_today
        ]
        due_today_items = [
            item for item in actionable_items
            if item.scheduled_date == local_today
        ]
        next_actionable_item = min(
            actionable_items,
            key=lambda item: (item.scheduled_date, item.schedule_order_index, item.id),
            default=None,
        )
    else:
        overdue_items = []
        due_today_items = []
        next_actionable_item = None

    completion_rate = round(
        (completed_items_count / total_items) * 100.0,
        2,
    ) if total_items > 0 else 0.0

    is_plan_finished = total_items > 0 and (pending_items_count + in_progress_items_count == 0)
    can_mark_completed = plan.status == "active" and is_plan_finished

    return {
        "plan_id": plan.id,
        "plan_status": plan.status,
        "schedule_timezone_snapshot": schedule_timezone_snapshot,
        "total_items": total_items,
        "pending_items_count": pending_items_count,
        "in_progress_items_count": in_progress_items_count,
        "completed_items_count": completed_items_count,
        "skipped_items_count": skipped_items_count,
        "overdue_items_count": len(overdue_items),
        "due_today_items_count": len(due_today_items),
        "completion_rate": completion_rate,
        "is_plan_finished": is_plan_finished,
        "can_mark_completed": can_mark_completed,
        "next_actionable_item_id": next_actionable_item.id if next_actionable_item else None,
        "next_actionable_scheduled_date": (
            next_actionable_item.scheduled_date.isoformat()
            if next_actionable_item else None
        ),
        "next_actionable_title": next_actionable_item.title if next_actionable_item else None,
    }


def list_plan_items_with_execution_state(
    db: Session,
    user_id: int,
    plan_id: int,
    status_filter: str | None = None,
    actionable_only: bool = False,
) -> list[dict]:
    plan = _get_plan_with_items(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    if status_filter is not None and status_filter not in ITEM_STATUS_OPTIONS:
        raise ValidationException("Invalid learning plan item status filter.")

    items = list(plan.items)

    if status_filter is not None:
        items = [item for item in items if item.status == status_filter]

    if actionable_only:
        items = [item for item in items if item.status in ACTIONABLE_ITEM_STATUSES]

    return [serialize_learning_plan_item(plan, item) for item in items]


def get_plan_execution_summary(
    db: Session,
    user_id: int,
    plan_id: int,
) -> dict:
    plan = _get_plan_with_items(db=db, user_id=user_id, plan_id=plan_id)
    if not plan:
        raise NotFoundException("Learning plan not found.")

    return build_plan_execution_summary(plan=plan, plan_items=list(plan.items))


def _load_plan_and_item_for_action(
    db: Session,
    user_id: int,
    plan_id: int,
    item_id: int,
) -> tuple[LearningPlan, LearningPlanItem]:
    plan = (
        db.query(LearningPlan)
        .filter(LearningPlan.user_id == user_id)
        .filter(LearningPlan.id == plan_id)
        .first()
    )
    if not plan:
        raise NotFoundException("Learning plan not found.")

    item = _get_plan_item_with_context(db=db, plan_id=plan.id, item_id=item_id)
    if not item:
        raise NotFoundException("Learning plan item not found.")

    return plan, item


def _build_plan_item_event_payload(
    plan: LearningPlan,
    item: LearningPlanItem,
    *,
    event_type: str,
    extra_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    schedule_timezone_snapshot = resolve_effective_timezone(plan.schedule_timezone_snapshot)

    payload: dict[str, Any] = {
        "event_source": "plan_execution_service",
        "event_type": event_type,
        "plan_id": plan.id,
        "plan_status": plan.status,
        "plan_schedule_revision": getattr(plan, "schedule_revision", None),
        "plan_item_id": item.id,
        "plan_course_id": item.plan_course_id,
        "course_id": item.course_id,
        "course_unit_id": item.course_unit_id,
        "course_title": item.course.title if item.course else None,
        "course_provider": item.course.provider if item.course else None,
        "course_unit_title": item.course_unit.title if item.course_unit else None,
        "title": item.title,
        "item_type": item.item_type,
        "item_status": item.status,
        "scheduled_date": item.scheduled_date.isoformat() if item.scheduled_date else None,
        "time_window": item.time_window,
        "planned_minutes": item.planned_minutes,
        "actual_minutes": item.actual_minutes,
        "actual_started_at": item.actual_started_at.isoformat() if item.actual_started_at else None,
        "actual_completed_at": item.actual_completed_at.isoformat() if item.actual_completed_at else None,
        "skipped_at": item.skipped_at.isoformat() if item.skipped_at else None,
        "skip_reason": item.skip_reason,
        "segment_index": item.segment_index,
        "segment_start_second": item.segment_start_second,
        "segment_end_second": item.segment_end_second,
        "practical_signal": item.practical_signal,
        "load_signal": item.load_signal,
        "schedule_timezone_snapshot": schedule_timezone_snapshot,
        "is_due_today": is_learning_plan_item_due_today(plan, item),
        "is_overdue": is_learning_plan_item_overdue(plan, item),
        "item_metadata": dict(item.item_metadata or {}),
    }

    if extra_payload:
        payload.update(extra_payload)

    return payload


def _build_execution_action_response(
    db: Session,
    user_id: int,
    plan_id: int,
    item_id: int,
) -> dict:
    updated_plan = _get_plan_with_items(db=db, user_id=user_id, plan_id=plan_id)
    updated_item = _get_plan_item_with_context(db=db, plan_id=plan_id, item_id=item_id)

    return {
        "item": serialize_learning_plan_item(updated_plan, updated_item),
        "execution_summary": build_plan_execution_summary(
            plan=updated_plan,
            plan_items=list(updated_plan.items),
        ),
    }


def _finalize_execution_action(
    db: Session,
    user_id: int,
    plan: LearningPlan,
    item: LearningPlanItem,
    *,
    event_type: str,
    event_payload: dict[str, Any],
) -> dict:
    from app.services.plan_service import refresh_plan_summary

    db.flush()
    refresh_plan_summary(db=db, plan=plan)

    create_system_user_event(
        db=db,
        user_id=user_id,
        event_type=event_type,
        event_payload=event_payload,
        commit=False,
        refresh_learning_state_after=True,
    )

    db.commit()

    return _build_execution_action_response(
        db=db,
        user_id=user_id,
        plan_id=plan.id,
        item_id=item.id,
    )


def start_learning_plan_item(
    db: Session,
    user_id: int,
    plan_id: int,
    item_id: int,
    expected_version: int,
) -> dict:
    plan, item = _load_plan_and_item_for_action(
        db=db,
        user_id=user_id,
        plan_id=plan_id,
        item_id=item_id,
    )

    _assert_plan_is_active_for_execution(plan)
    assert_expected_version(
        resource_name="learning_plan_item",
        expected_version=expected_version,
        current_version=item.version,
    )
    _assert_item_status(
        item=item,
        allowed_statuses={"pending"},
        message="Only pending items can be started.",
    )

    started_now = False

    item.status = "in_progress"
    if item.actual_started_at is None:
        item.actual_started_at = _now_utc()
        started_now = True
    item.version += 1

    event_payload = _build_plan_item_event_payload(
        plan=plan,
        item=item,
        event_type="plan_item_started",
        extra_payload={
            "started_now": started_now,
        },
    )

    return _finalize_execution_action(
        db=db,
        user_id=user_id,
        plan=plan,
        item=item,
        event_type="plan_item_started",
        event_payload=event_payload,
    )


def complete_learning_plan_item(
    db: Session,
    user_id: int,
    plan_id: int,
    item_id: int,
    actual_minutes: int | None,
    expected_version: int,
) -> dict:
    plan, item = _load_plan_and_item_for_action(
        db=db,
        user_id=user_id,
        plan_id=plan_id,
        item_id=item_id,
    )

    _assert_plan_is_active_for_execution(plan)
    assert_expected_version(
        resource_name="learning_plan_item",
        expected_version=expected_version,
        current_version=item.version,
    )
    _assert_item_status(
        item=item,
        allowed_statuses={"pending", "in_progress"},
        message="Only pending or in-progress items can be completed.",
    )

    now = _now_utc()
    auto_started = False

    if item.actual_started_at is None:
        item.actual_started_at = now
        auto_started = True

    resolved_actual_minutes = actual_minutes or item.actual_minutes or item.planned_minutes

    item.status = "completed"
    item.actual_completed_at = now
    item.actual_minutes = resolved_actual_minutes
    item.skipped_at = None
    item.skip_reason = None
    item.version += 1

    event_payload = _build_plan_item_event_payload(
        plan=plan,
        item=item,
        event_type="plan_item_completed",
        extra_payload={
            "auto_started_during_completion": auto_started,
            "completed_at": now.isoformat(),
            "resolved_actual_minutes": resolved_actual_minutes,
        },
    )

    return _finalize_execution_action(
        db=db,
        user_id=user_id,
        plan=plan,
        item=item,
        event_type="plan_item_completed",
        event_payload=event_payload,
    )


def skip_learning_plan_item(
    db: Session,
    user_id: int,
    plan_id: int,
    item_id: int,
    skip_reason: str | None,
    expected_version: int,
) -> dict:
    plan, item = _load_plan_and_item_for_action(
        db=db,
        user_id=user_id,
        plan_id=plan_id,
        item_id=item_id,
    )

    _assert_plan_is_active_for_execution(plan)
    assert_expected_version(
        resource_name="learning_plan_item",
        expected_version=expected_version,
        current_version=item.version,
    )
    _assert_item_status(
        item=item,
        allowed_statuses={"pending", "in_progress"},
        message="Only pending or in-progress items can be skipped.",
    )

    skipped_now = _now_utc()
    normalized_skip_reason = skip_reason.strip() if skip_reason else None

    item.status = "skipped"
    item.skipped_at = skipped_now
    item.skip_reason = normalized_skip_reason
    item.actual_completed_at = None
    item.version += 1

    event_payload = _build_plan_item_event_payload(
        plan=plan,
        item=item,
        event_type="plan_item_skipped",
        extra_payload={
            "skipped_at": skipped_now.isoformat(),
            "normalized_skip_reason": normalized_skip_reason,
        },
    )

    return _finalize_execution_action(
        db=db,
        user_id=user_id,
        plan=plan,
        item=item,
        event_type="plan_item_skipped",
        event_payload=event_payload,
    )
