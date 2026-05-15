from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import AppException, ConflictException, NotFoundException, ValidationException
from app.models.assistant_action_run import AssistantActionRun
from app.schemas.assistant import ASSISTANT_ACTION_TYPE_OPTIONS
from app.schemas.learning_plan import LearningPlanStatusUpdateRequest
from app.services.assistant_action_policy_service import revalidate_action_run_eligibility
from app.services.assistant_context_service import get_safe_plan_for_action_review
from app.services.plan_lifecycle_service import update_learning_plan_status
from app.services.plan_queue_service import add_course_to_schedule_queue
from app.services.plan_recovery_service import apply_plan_recovery, get_plan_recovery_preview
from app.services.user_event_service import create_system_user_event


SUPPORTED_EXECUTABLE_ACTIONS = {
    "review_active_plan_adjustment_options",
    "review_plan_recovery_options",
    "apply_recommended_recovery",
    "pause_active_plan",
    "resume_active_plan",
    "queue_top_recommendation",
}


ACTION_DISPLAY_METADATA: dict[str, dict[str, str]] = {
    "review_active_plan_adjustment_options": {
        "title": "Review plan adjustment options",
        "summary": "Prepare a safe review of the active plan before making any real schedule change.",
    },
    "review_plan_recovery_options": {
        "title": "Review recovery options",
        "summary": "Prepare a recovery preview for the active plan without changing any schedule items yet.",
    },
    "apply_recommended_recovery": {
        "title": "Apply recommended recovery",
        "summary": "Apply the currently recommended recovery mode to pending items only after confirmation.",
    },
    "pause_active_plan": {
        "title": "Pause active plan",
        "summary": "Pause the active learning plan while preserving all current schedule and execution history.",
    },
    "resume_active_plan": {
        "title": "Resume the paused plan",
        "summary": "Resume the paused learning plan so it can continue execution and recovery workflows.",
    },
    "queue_top_recommendation": {
        "title": "Queue this course",
        "summary": "Add the strongest assistant-picked next course into your schedule queue after confirmation.",
    },
}


def _make_json_safe(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, (str, int, float, bool)):
        return value

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, dict):
        return {str(key): _make_json_safe(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [_make_json_safe(item) for item in value]

    if hasattr(value, "model_dump"):
        return _make_json_safe(value.model_dump())

    return str(value)


def get_action_display_metadata(action_type: str) -> dict[str, str]:
    return ACTION_DISPLAY_METADATA.get(
        action_type,
        {"title": action_type, "summary": action_type},
    )


def list_action_runs(db: Session, user_id: int, *, conversation_id: int | None = None) -> list[AssistantActionRun]:
    query = (
        db.query(AssistantActionRun)
        .filter(AssistantActionRun.user_id == user_id)
        .order_by(AssistantActionRun.updated_at.desc(), AssistantActionRun.id.desc())
    )

    if conversation_id is not None:
        query = query.filter(AssistantActionRun.conversation_id == conversation_id)

    return query.all()


def create_action_run(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    source_message_id: int | None,
    action_type: str,
    request_payload: dict,
    preview_payload: dict,
) -> AssistantActionRun:
    if action_type not in ASSISTANT_ACTION_TYPE_OPTIONS:
        raise ValidationException("Invalid assistant action type.")

    normalized_request_payload = _make_json_safe(request_payload or {})
    normalized_preview_payload = _make_json_safe(preview_payload or {})

    existing = (
        db.query(AssistantActionRun)
        .filter(AssistantActionRun.user_id == user_id)
        .filter(AssistantActionRun.conversation_id == conversation_id)
        .filter(AssistantActionRun.action_type == action_type)
        .filter(AssistantActionRun.status == "proposed")
        .order_by(AssistantActionRun.id.desc())
        .first()
    )
    if existing and dict(existing.request_payload or {}) == dict(normalized_request_payload or {}):
        return existing

    action_run = AssistantActionRun(
        user_id=user_id,
        conversation_id=conversation_id,
        source_message_id=source_message_id,
        action_type=action_type,
        status="proposed",
        request_payload=normalized_request_payload,
        preview_payload=normalized_preview_payload,
        result_payload={},
    )
    db.add(action_run)
    db.flush()
    return action_run


def get_action_run_by_id(db: Session, user_id: int, action_run_id: int) -> AssistantActionRun:
    action_run = (
        db.query(AssistantActionRun)
        .filter(AssistantActionRun.user_id == user_id)
        .filter(AssistantActionRun.id == action_run_id)
        .first()
    )
    if not action_run:
        raise NotFoundException("Assistant action run not found.")
    return action_run


def _emit_action_event(
    db: Session,
    *,
    user_id: int,
    action_type: str,
    plan_id: int | None,
    status: str,
    course_id: int | None = None,
) -> None:
    create_system_user_event(
        db=db,
        user_id=user_id,
        event_type="assistant_action_executed",
        event_payload={
            "action_type": action_type,
            "plan_id": plan_id,
            "course_id": course_id,
            "status": status,
        },
        commit=False,
        refresh_learning_state_after=False,
    )


def _fail_action_run(
    db: Session,
    *,
    action_run: AssistantActionRun,
    failure_reason: str,
    result_payload: dict[str, Any] | None = None,
) -> None:
    action_run.status = "failed"
    action_run.failure_reason = failure_reason
    action_run.result_payload = _make_json_safe(result_payload or {"failure_reason": failure_reason})
    db.commit()
    db.refresh(action_run)


def _claim_proposed_action_run(
    db: Session,
    *,
    user_id: int,
    action_run_id: int,
) -> AssistantActionRun:
    claimed_rows = (
        db.query(AssistantActionRun)
        .filter(AssistantActionRun.user_id == user_id)
        .filter(AssistantActionRun.id == action_run_id)
        .filter(AssistantActionRun.status == "proposed")
        .update(
            {AssistantActionRun.status: "confirmed"},
            synchronize_session=False,
        )
    )
    if claimed_rows == 1:
        db.flush()
        db.expire_all()
        return get_action_run_by_id(db=db, user_id=user_id, action_run_id=action_run_id)

    db.expire_all()
    action_run = get_action_run_by_id(db=db, user_id=user_id, action_run_id=action_run_id)
    if action_run.status == "executed":
        raise ConflictException("Assistant action run is already executed.")
    if action_run.status == "dismissed":
        raise ConflictException("Assistant action run is already dismissed.")
    if action_run.status == "failed":
        raise ConflictException("Assistant action run has already failed.")
    if action_run.status == "confirmed":
        raise ConflictException("Assistant action run is already being processed.")
    raise ConflictException("Assistant action run cannot be confirmed in its current status.")


def confirm_action_run(db: Session, user_id: int, action_run_id: int) -> AssistantActionRun:
    action_run = get_action_run_by_id(db=db, user_id=user_id, action_run_id=action_run_id)

    if action_run.action_type not in SUPPORTED_EXECUTABLE_ACTIONS:
        raise ConflictException("Assistant action type is not executable in this block stage.")

    action_run = _claim_proposed_action_run(db=db, user_id=user_id, action_run_id=action_run_id)

    eligibility = revalidate_action_run_eligibility(
        db=db,
        user_id=user_id,
        action_type=action_run.action_type,
        request_payload=dict(action_run.request_payload or {}),
    )
    if not eligibility.is_allowed:
        failure_reason = eligibility.failure_reason or "assistant_action_not_eligible"
        _fail_action_run(
            db=db,
            action_run=action_run,
            failure_reason=failure_reason,
        )
        raise ConflictException(f"Assistant action is no longer eligible: {action_run.failure_reason}.")

    if eligibility.preview_payload:
        action_run.preview_payload = _make_json_safe(eligibility.preview_payload)

    try:
        if action_run.action_type == "review_active_plan_adjustment_options":
            plan_id = action_run.request_payload.get("plan_id")
            plan_context = get_safe_plan_for_action_review(db=db, user_id=user_id, plan_id=plan_id)
            action_run.result_payload = _make_json_safe(
                {
                    "plan_id": plan_context.get("plan_id"),
                    "plan_status": plan_context.get("status"),
                    "plan_version": plan_context.get("version"),
                    "schedule_revision": plan_context.get("schedule_revision"),
                    "schedule_timezone_snapshot": plan_context.get("schedule_timezone_snapshot"),
                    "preferred_time_window": plan_context.get("preferred_time_window"),
                    "pace_mode": plan_context.get("pace_mode"),
                    "summary": dict(plan_context.get("summary") or {}),
                }
            )
            action_run.status = "executed"
            action_run.failure_reason = None
            _emit_action_event(
                db=db,
                user_id=user_id,
                action_type=action_run.action_type,
                plan_id=action_run.result_payload.get("plan_id"),
                status=action_run.status,
            )

        elif action_run.action_type == "review_plan_recovery_options":
            plan_id = action_run.request_payload.get("plan_id")
            if plan_id is None:
                raise ValidationException("Assistant recovery review requires plan_id.")
            preview = get_plan_recovery_preview(db=db, user_id=user_id, plan_id=plan_id)
            action_run.result_payload = _make_json_safe(dict(preview))
            action_run.status = "executed"
            action_run.failure_reason = None
            _emit_action_event(
                db=db,
                user_id=user_id,
                action_type=action_run.action_type,
                plan_id=plan_id,
                status=action_run.status,
            )

        elif action_run.action_type == "apply_recommended_recovery":
            plan_id = action_run.request_payload.get("plan_id")
            mode = action_run.request_payload.get("mode")
            expected_version = action_run.request_payload.get("expected_version")
            expected_schedule_revision = action_run.request_payload.get("expected_schedule_revision")
            if plan_id is None or mode is None:
                raise ValidationException("Assistant recovery action requires plan_id and mode.")
            if expected_version is None or expected_schedule_revision is None:
                raise ValidationException("Assistant recovery action requires stale-write protections.")

            recovery_result = apply_plan_recovery(
                db=db,
                user_id=user_id,
                plan_id=plan_id,
                mode=mode,
                expected_version=expected_version,
                expected_schedule_revision=expected_schedule_revision,
                preferred_time_window=action_run.request_payload.get("preferred_time_window"),
                pace_mode=None,
                preferred_study_days=[],
                max_daily_minutes=None,
                session_cap_minutes=None,
                temporary_note=action_run.request_payload.get("temporary_note"),
                recovery_note="Applied from SOLA assistant",
            )
            action_run.result_payload = _make_json_safe(dict(recovery_result))
            action_run.status = "executed"
            action_run.failure_reason = None
            _emit_action_event(
                db=db,
                user_id=user_id,
                action_type=action_run.action_type,
                plan_id=plan_id,
                status=action_run.status,
            )

        elif action_run.action_type == "pause_active_plan":
            plan_id = action_run.request_payload.get("plan_id")
            expected_version = action_run.request_payload.get("expected_version")
            if plan_id is None:
                raise ValidationException("Assistant pause action requires plan_id.")
            if expected_version is None:
                raise ValidationException("Assistant pause action requires stale-write protections.")
            plan = update_learning_plan_status(
                db=db,
                user_id=user_id,
                plan_id=plan_id,
                payload=LearningPlanStatusUpdateRequest(
                    status="paused",
                    expected_version=expected_version,
                ),
            )
            action_run.result_payload = _make_json_safe(
                {
                    "plan_id": plan.id,
                    "status": plan.status,
                    "version": plan.version,
                    "schedule_revision": plan.schedule_revision,
                }
            )
            action_run.status = "executed"
            action_run.failure_reason = None
            _emit_action_event(
                db=db,
                user_id=user_id,
                action_type=action_run.action_type,
                plan_id=plan.id,
                status=action_run.status,
            )

        elif action_run.action_type == "resume_active_plan":
            plan_id = action_run.request_payload.get("plan_id")
            expected_version = action_run.request_payload.get("expected_version")
            if plan_id is None:
                raise ValidationException("Assistant resume action requires plan_id.")
            if expected_version is None:
                raise ValidationException("Assistant resume action requires stale-write protections.")
            plan = update_learning_plan_status(
                db=db,
                user_id=user_id,
                plan_id=plan_id,
                payload=LearningPlanStatusUpdateRequest(
                    status="active",
                    expected_version=expected_version,
                ),
            )
            action_run.result_payload = _make_json_safe(
                {
                    "plan_id": plan.id,
                    "status": plan.status,
                    "version": plan.version,
                    "schedule_revision": plan.schedule_revision,
                }
            )
            action_run.status = "executed"
            action_run.failure_reason = None
            _emit_action_event(
                db=db,
                user_id=user_id,
                action_type=action_run.action_type,
                plan_id=plan.id,
                status=action_run.status,
            )

        elif action_run.action_type == "queue_top_recommendation":
            course_id = action_run.request_payload.get("course_id")
            note = action_run.request_payload.get("note")
            if course_id is None:
                raise ValidationException("Assistant queue action requires course_id.")
            queue_item = add_course_to_schedule_queue(
                db=db,
                user_id=user_id,
                course_id=course_id,
                note=note,
            )
            action_run.result_payload = _make_json_safe(
                {
                    "queue_item_id": queue_item.id,
                    "course_id": queue_item.course_id,
                    "status": queue_item.status,
                }
            )
            action_run.status = "executed"
            action_run.failure_reason = None
            _emit_action_event(
                db=db,
                user_id=user_id,
                action_type=action_run.action_type,
                plan_id=None,
                course_id=queue_item.course_id,
                status=action_run.status,
            )
    except AppException as exc:
        _fail_action_run(
            db=db,
            action_run=action_run,
            failure_reason=exc.error_code,
            result_payload={"failure_reason": exc.error_code},
        )
        raise

    db.commit()
    db.refresh(action_run)
    return action_run
