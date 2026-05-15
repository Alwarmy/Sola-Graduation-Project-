from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import TYPE_CHECKING, Any

from app.core.exceptions import AppException

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass(frozen=True)
class AssistantActionCandidate:
    action_type: str
    request_payload: dict[str, Any]
    preview_payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AssistantActionEligibilityResult:
    is_allowed: bool
    failure_reason: str | None
    preview_payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_SUPPORTED_ACTION_TYPES = {
    "review_active_plan_adjustment_options",
    "review_plan_recovery_options",
    "apply_recommended_recovery",
    "pause_active_plan",
    "resume_active_plan",
    "queue_top_recommendation",
}


def _normalize_payload_signature(payload: dict[str, Any]) -> tuple:
    normalized_items: list[tuple[str, Any]] = []
    for key in sorted(payload.keys()):
        value = payload[key]
        if isinstance(value, dict):
            normalized_value = _normalize_payload_signature(value)
        elif isinstance(value, list):
            normalized_value = tuple(value)
        else:
            normalized_value = value
        normalized_items.append((key, normalized_value))
    return tuple(normalized_items)


def _deduplicate_candidates(candidates: list[AssistantActionCandidate]) -> list[AssistantActionCandidate]:
    seen: set[tuple[str, tuple]] = set()
    unique: list[AssistantActionCandidate] = []
    for candidate in candidates:
        signature = (candidate.action_type, _normalize_payload_signature(candidate.request_payload))
        if signature in seen:
            continue
        seen.add(signature)
        unique.append(candidate)
    return unique


def _find_queueable_recommendation(context: dict[str, Any]) -> dict[str, Any] | None:
    recommendations = list(context.get("recommendations") or [])
    active_plan_courses = list(context.get("active_plan_courses") or [])
    schedule_queue_courses = list(context.get("schedule_queue_courses") or [])

    active_course_ids = {course.get("course_id") for course in active_plan_courses}
    queued_course_ids = {course.get("course_id") for course in schedule_queue_courses}

    return next(
        (
            recommendation
            for recommendation in recommendations
            if recommendation.get("course_id") not in active_course_ids
            and recommendation.get("course_id") not in queued_course_ids
        ),
        None,
    )


def evaluate_action_eligibility(
    *,
    action_type: str,
    request_payload: dict[str, Any],
    context: dict[str, Any],
) -> AssistantActionEligibilityResult:
    active_plan = context.get("active_plan") or {}
    recovery_preview = context.get("recovery_preview") or {}
    plan_status = active_plan.get("status")
    plan_id = active_plan.get("plan_id")
    plan_version = active_plan.get("version")
    schedule_revision = recovery_preview.get("schedule_revision")

    requested_plan_version = request_payload.get("expected_version")
    if (
        action_type in {"apply_recommended_recovery", "pause_active_plan", "resume_active_plan"}
        and requested_plan_version is None
    ):
        return AssistantActionEligibilityResult(False, "missing_expected_version", {})
    if (
        action_type in {"apply_recommended_recovery", "pause_active_plan", "resume_active_plan"}
        and requested_plan_version is not None
        and plan_version is not None
        and requested_plan_version != plan_version
    ):
        return AssistantActionEligibilityResult(False, "stale_plan_version", {})

    if action_type not in _SUPPORTED_ACTION_TYPES:
        return AssistantActionEligibilityResult(False, "unsupported_action_type", {})

    if action_type == "review_active_plan_adjustment_options":
        if plan_id is None:
            return AssistantActionEligibilityResult(False, "no_active_plan", {})
        if plan_status not in {"active", "paused"}:
            return AssistantActionEligibilityResult(False, "plan_not_open", {})
        summary = dict(active_plan.get("summary") or {})
        return AssistantActionEligibilityResult(
            True,
            None,
            {
                "plan_id": plan_id,
                "status": plan_status,
                "plan_version": plan_version,
                "schedule_revision": active_plan.get("schedule_revision"),
                "pending_items_count": summary.get("pending_items_count"),
                "overdue_items_count": summary.get("overdue_items_count"),
                "preferred_time_window": active_plan.get("preferred_time_window"),
            },
        )

    if action_type == "review_plan_recovery_options":
        if plan_id is None:
            return AssistantActionEligibilityResult(False, "no_active_plan", {})
        if not recovery_preview.get("needs_recovery"):
            return AssistantActionEligibilityResult(False, "no_recovery_needed", {})
        return AssistantActionEligibilityResult(
            True,
            None,
            {
                "plan_id": plan_id,
                "plan_version": recovery_preview.get("plan_version"),
                "schedule_revision": schedule_revision,
                "recommended_action": recovery_preview.get("recommended_action"),
                "recommended_recovery_mode": recovery_preview.get("recommended_recovery_mode"),
                "overdue_items_count": recovery_preview.get("overdue_items_count"),
                "drift_level": recovery_preview.get("drift_level"),
            },
        )

    if action_type == "apply_recommended_recovery":
        requested_mode = request_payload.get("mode")
        requested_schedule_revision = request_payload.get("expected_schedule_revision")
        if plan_id is None:
            return AssistantActionEligibilityResult(False, "no_active_plan", {})
        if plan_status != "active":
            return AssistantActionEligibilityResult(False, "plan_not_active", {})
        if not recovery_preview.get("needs_recovery"):
            return AssistantActionEligibilityResult(False, "no_recovery_needed", {})
        if requested_schedule_revision is None:
            return AssistantActionEligibilityResult(False, "missing_expected_schedule_revision", {})
        if (
            requested_schedule_revision is not None
            and schedule_revision is not None
            and requested_schedule_revision != schedule_revision
        ):
            return AssistantActionEligibilityResult(False, "stale_schedule_revision", {})
        recommended_mode = recovery_preview.get("recommended_recovery_mode")
        if not recommended_mode:
            return AssistantActionEligibilityResult(False, "recovery_mode_unavailable", {})
        if requested_mode != recommended_mode:
            return AssistantActionEligibilityResult(False, "recovery_mode_stale", {})
        return AssistantActionEligibilityResult(
            True,
            None,
            {
                "plan_id": plan_id,
                "plan_version": plan_version,
                "schedule_revision": schedule_revision,
                "mode": recommended_mode,
                "overdue_items_count": recovery_preview.get("overdue_items_count"),
                "recovery_pressure_ratio": recovery_preview.get("recovery_pressure_ratio"),
            },
        )

    if action_type == "pause_active_plan":
        if plan_id is None:
            return AssistantActionEligibilityResult(False, "no_active_plan", {})
        if plan_status != "active":
            return AssistantActionEligibilityResult(False, "plan_not_active", {})
        return AssistantActionEligibilityResult(
            True,
            None,
            {
                "plan_id": plan_id,
                "plan_version": plan_version,
                "status_after": "paused",
            },
        )

    if action_type == "resume_active_plan":
        if plan_id is None:
            return AssistantActionEligibilityResult(False, "no_active_plan", {})
        if plan_status != "paused":
            return AssistantActionEligibilityResult(False, "plan_not_paused", {})
        return AssistantActionEligibilityResult(
            True,
            None,
            {
                "plan_id": plan_id,
                "plan_version": plan_version,
                "status_after": "active",
            },
        )

    if action_type == "queue_top_recommendation":
        candidate = _find_queueable_recommendation(context)
        requested_course_id = request_payload.get("course_id")
        if candidate is None or requested_course_id is None:
            return AssistantActionEligibilityResult(False, "no_queueable_recommendation", {})
        if candidate.get("course_id") != requested_course_id:
            return AssistantActionEligibilityResult(False, "recommendation_stale", {})
        return AssistantActionEligibilityResult(
            True,
            None,
            {
                "course_id": candidate.get("course_id"),
                "title": candidate.get("title"),
                "topic_tags": list(candidate.get("topic_tags") or []),
                "difficulty_level": candidate.get("difficulty_level"),
            },
        )

    return AssistantActionEligibilityResult(False, "unsupported_action_type", {})


def build_eligible_assistant_actions(
    *,
    intent: str,
    context: dict[str, Any],
    governance: dict[str, Any],
) -> list[AssistantActionCandidate]:
    if not governance.get("can_suggest_actions"):
        return []

    active_plan = context.get("active_plan") or {}
    recovery_preview = context.get("recovery_preview") or {}
    plan_id = active_plan.get("plan_id")
    plan_status = active_plan.get("status")
    plan_version = active_plan.get("version")

    candidates: list[AssistantActionCandidate] = []

    def _append(action_type: str, request_payload: dict[str, Any]) -> None:
        eligibility = evaluate_action_eligibility(action_type=action_type, request_payload=request_payload, context=context)
        if not eligibility.is_allowed:
            return
        candidates.append(
            AssistantActionCandidate(
                action_type=action_type,
                request_payload=request_payload,
                preview_payload=eligibility.preview_payload,
            )
        )

    if intent == "schedule_support":
        if plan_id is not None:
            _append("review_active_plan_adjustment_options", {"plan_id": plan_id})
            if recovery_preview.get("needs_recovery"):
                _append("review_plan_recovery_options", {"plan_id": plan_id})

    if intent == "recovery_guidance" and plan_id is not None and recovery_preview.get("needs_recovery"):
        _append("review_plan_recovery_options", {"plan_id": plan_id})
        if recovery_preview.get("recommended_recovery_mode") and plan_version is not None and recovery_preview.get("schedule_revision") is not None:
            _append(
                "apply_recommended_recovery",
                {
                    "plan_id": plan_id,
                    "mode": recovery_preview.get("recommended_recovery_mode"),
                    "expected_version": plan_version,
                    "expected_schedule_revision": recovery_preview.get("schedule_revision"),
                    "temporary_note": active_plan.get("temporary_note"),
                },
            )

    if intent in {"progress_reflection", "schedule_support", "recovery_guidance"} and plan_id is not None:
        if plan_status == "active" and plan_version is not None:
            _append("pause_active_plan", {"plan_id": plan_id, "expected_version": plan_version})
        elif plan_status == "paused" and plan_version is not None:
            _append("resume_active_plan", {"plan_id": plan_id, "expected_version": plan_version})

    if intent in {"next_course_guidance", "recommendation_explanation", "course_comparison"}:
        candidate = _find_queueable_recommendation(context)
        if candidate is not None:
            _append(
                "queue_top_recommendation",
                {
                    "course_id": candidate.get("course_id"),
                    "note": "Queued from SOLA assistant recommendation.",
                },
            )

    return _deduplicate_candidates(candidates)


def revalidate_action_run_eligibility(
    db: "Session",
    *,
    user_id: int,
    action_type: str,
    request_payload: dict[str, Any],
) -> AssistantActionEligibilityResult:
    from app.models.schedule_queue_item import ScheduleQueueItem
    from app.services.plan_recovery_service import get_plan_recovery_preview
    from app.services.plan_shared import get_learning_plan_by_id, is_course_in_any_open_plan

    plan_id = request_payload.get("plan_id")
    active_plan: dict[str, Any] = {}
    recovery_preview: dict[str, Any] = {}
    recommendations: list[dict[str, Any]] = []
    active_plan_courses: list[dict[str, Any]] = []
    schedule_queue_courses: list[dict[str, Any]] = []

    if plan_id is not None:
        plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id)
        if plan is not None:
            active_plan = {
                "plan_id": plan.id,
                "title": plan.title,
                "status": plan.status,
                "version": plan.version,
                "schedule_revision": plan.schedule_revision,
                "preferred_time_window": getattr(getattr(plan, "preference", None), "preferred_time_window", None),
                "temporary_note": getattr(getattr(plan, "preference", None), "temporary_note", None),
                "summary": dict(plan.plan_summary or {}),
            }
            try:
                recovery_preview = dict(get_plan_recovery_preview(db=db, user_id=user_id, plan_id=plan.id))
            except AppException:
                recovery_preview = {}

    if action_type == "queue_top_recommendation":
        requested_course_id = request_payload.get("course_id")
        if requested_course_id is None:
            return AssistantActionEligibilityResult(False, "missing_course_id", {})
        if is_course_in_any_open_plan(db=db, user_id=user_id, course_id=requested_course_id):
            return AssistantActionEligibilityResult(False, "course_already_in_open_plan", {})
        queue_item = (
            db.query(ScheduleQueueItem)
            .filter(ScheduleQueueItem.user_id == user_id)
            .filter(ScheduleQueueItem.course_id == requested_course_id)
            .first()
        )
        if queue_item is not None:
            return AssistantActionEligibilityResult(False, "course_already_in_queue", {})
        return AssistantActionEligibilityResult(
            True,
            None,
            {
                "course_id": requested_course_id,
            },
        )

    eligibility_context = {
        "active_plan": active_plan,
        "recovery_preview": recovery_preview,
        "recommendations": recommendations,
        "active_plan_courses": active_plan_courses,
        "schedule_queue_courses": schedule_queue_courses,
    }
    return evaluate_action_eligibility(
        action_type=action_type,
        request_payload=request_payload,
        context=eligibility_context,
    )
