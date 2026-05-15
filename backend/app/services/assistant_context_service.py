from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import AppException, NotFoundException
from app.models.assistant_memory_signal import AssistantMemorySignal
from app.models.learning_plan_item import LearningPlanItem
from app.models.user_event import UserEvent
from app.services.assistant_memory_service import list_effective_memory_signals
from app.services.plan_readiness_service import refresh_plan_summary
from app.services.plan_recovery_service import get_plan_recovery_preview
from app.services.plan_shared import (
    get_active_learning_plan,
    get_learning_plan_by_id,
    get_plan_courses,
    get_plan_preference,
    list_schedule_queue_items,
)
from app.services.recommendation_service import get_personalized_recommendations
from app.services.user_learning_state_service import get_user_learning_state
from app.services.user_profile_service import get_user_profile

SAFE_EVENT_PAYLOAD_KEYS: dict[str, set[str]] = {
    "search_performed": {"query"},
    "course_opened": {"course_id", "course_title", "content_type"},
    "course_saved": {"course_id", "course_title"},
    "course_selected": {"course_id", "course_title", "topic_tags"},
    "recommendation_clicked": {"course_id", "course_title"},
    "plan_item_started": {"plan_id", "plan_item_id", "course_id", "course_title"},
    "plan_item_completed": {"plan_id", "plan_item_id", "course_id", "course_title"},
    "plan_item_skipped": {"plan_id", "plan_item_id", "course_id", "course_title", "skip_reason"},
    "assistant_memory_signal_confirmed": {"signal_key", "scope", "signal_type", "signal_value"},
    "assistant_memory_signal_superseded": {"signal_key", "scope", "superseded_by_signal_id"},
    "assistant_action_executed": {"action_type", "plan_id", "status"},
}


@dataclass(slots=True)
class AssistantSafeContext:
    profile: dict[str, Any]
    learning_state: dict[str, Any]
    active_plan: dict[str, Any]
    active_plan_courses: list[dict[str, Any]]
    schedule_queue_courses: list[dict[str, Any]]
    next_actionable_item: dict[str, Any]
    recovery_preview: dict[str, Any]
    recommendations: list[dict[str, Any]]
    recent_events: list[dict[str, Any]]
    active_memory_signals: list[dict[str, Any]]
    schedule_guidance_signals: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return _make_json_safe(asdict(self))


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


def _project_profile(profile: Any) -> dict[str, Any]:
    if profile is None:
        return {}
    return _make_json_safe(
        {
            "primary_track": profile.primary_track,
            "secondary_tracks": list(profile.secondary_tracks or []),
            "target_role": profile.target_role,
            "experience_level": profile.experience_level,
            "employment_status": profile.employment_status,
            "is_student": profile.is_student,
            "weekly_hours": profile.weekly_hours,
            "goal": profile.goal,
            "preferred_language": profile.preferred_language,
            "timezone": profile.timezone,
        }
    )


def _project_learning_state(learning_state: Any) -> dict[str, Any]:
    if learning_state is None:
        return {}
    return _make_json_safe(
        {
            "dominant_interests": list(learning_state.dominant_interests or []),
            "emerging_interests": list(learning_state.emerging_interests or []),
            "covered_topics": list(learning_state.covered_topics or []),
            "current_focus": learning_state.current_focus,
            "preferred_content_type": learning_state.preferred_content_type,
            "preferred_course_length": learning_state.preferred_course_length,
            "effective_preferred_language": learning_state.effective_preferred_language,
            "engagement_score": learning_state.engagement_score,
            "profile_alignment": dict(learning_state.profile_alignment or {}),
        }
    )


def _build_safe_event_payload(event: UserEvent) -> dict[str, Any]:
    allowed_keys = SAFE_EVENT_PAYLOAD_KEYS.get(event.event_type, set())
    payload = event.event_payload or {}
    return _make_json_safe({key: payload[key] for key in allowed_keys if key in payload})


def _project_recent_events(events: list[UserEvent]) -> list[dict[str, Any]]:
    return _make_json_safe(
        [
            {
                "event_type": event.event_type,
                "event_payload": _build_safe_event_payload(event),
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
            for event in events
        ]
    )


def _project_recommendations(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    projected: list[dict[str, Any]] = []
    for card in cards[:3]:
        projected.append(
            {
                "course_id": card.get("id"),
                "title": card.get("title"),
                "difficulty_level": card.get("difficulty_level"),
                "progression_hint": card.get("progression_hint"),
                "topic_tags": list(card.get("topic_tags") or []),
                "card_summary": card.get("card_summary"),
                "personalization": _make_json_safe(card.get("personalization")),
                "discovery": _make_json_safe(card.get("discovery")),
            }
        )
    return _make_json_safe(projected)


def _project_plan_summary(active_plan: Any, preference: Any) -> dict[str, Any]:
    if active_plan is None:
        return {}
    plan_summary = dict(active_plan.plan_summary or {})
    return _make_json_safe(
        {
            "plan_id": active_plan.id,
            "title": active_plan.title,
            "goal": active_plan.goal,
            "status": active_plan.status,
            "version": active_plan.version,
            "schedule_timezone_snapshot": active_plan.schedule_timezone_snapshot,
            "schedule_revision": active_plan.schedule_revision,
            "current_focus_snapshot": active_plan.current_focus_snapshot,
            "preferred_time_window": preference.preferred_time_window if preference else None,
            "pace_mode": preference.pace_mode if preference else None,
            "preferred_study_days": list(preference.preferred_study_days or []) if preference else [],
            "max_daily_minutes": preference.max_daily_minutes if preference else None,
            "session_cap_minutes": preference.session_cap_minutes if preference else None,
            "temporary_note": preference.temporary_note if preference else None,
            "summary": {
                "pending_items_count": plan_summary.get("pending_items_count"),
                "in_progress_items_count": plan_summary.get("in_progress_items_count"),
                "completed_items_count": plan_summary.get("completed_items_count"),
                "skipped_items_count": plan_summary.get("skipped_items_count"),
                "overdue_items_count": plan_summary.get("overdue_items_count"),
                "due_today_items_count": plan_summary.get("due_today_items_count"),
                "completion_rate": plan_summary.get("completion_rate"),
                "next_actionable_item_id": plan_summary.get("next_actionable_item_id"),
                "next_actionable_scheduled_date": plan_summary.get("next_actionable_scheduled_date"),
                "next_actionable_title": plan_summary.get("next_actionable_title"),
                "needs_recovery": plan_summary.get("needs_recovery"),
                "recommended_action": plan_summary.get("recommended_action"),
                "recommended_recovery_mode": plan_summary.get("recommended_recovery_mode"),
            },
        }
    )


def _project_plan_courses(plan_courses: list[Any]) -> list[dict[str, Any]]:
    projected: list[dict[str, Any]] = []
    for plan_course in plan_courses[:3]:
        projected.append(
            {
                "plan_course_id": plan_course.id,
                "course_id": plan_course.course_id,
                "title": plan_course.course.title if getattr(plan_course, "course", None) else None,
                "difficulty_level": getattr(getattr(plan_course, "course", None), "difficulty_level", None),
                "topic_tags": list(getattr(getattr(plan_course, "course", None), "topic_tags", []) or []),
                "status": plan_course.status,
                "order_index": plan_course.order_index,
            }
        )
    return _make_json_safe(projected)


def _project_schedule_queue_courses(queue_items: list[Any]) -> list[dict[str, Any]]:
    projected: list[dict[str, Any]] = []
    for queue_item in queue_items[:5]:
        projected.append(
            {
                "queue_item_id": queue_item.id,
                "course_id": queue_item.course_id,
                "title": queue_item.course.title if getattr(queue_item, "course", None) else None,
                "status": queue_item.status,
            }
        )
    return _make_json_safe(projected)


def _project_next_actionable_item(next_item: LearningPlanItem | None) -> dict[str, Any]:
    if next_item is None:
        return {}
    return _make_json_safe(
        {
            "plan_item_id": next_item.id,
            "course_id": next_item.course_id,
            "course_unit_id": next_item.course_unit_id,
            "title": next_item.title,
            "scheduled_date": next_item.scheduled_date.isoformat() if next_item.scheduled_date else None,
            "time_window": next_item.time_window,
            "planned_minutes": next_item.planned_minutes,
            "segment_index": next_item.segment_index,
            "course_title": next_item.course.title if next_item.course else None,
            "unit_title": next_item.course_unit.title if next_item.course_unit else None,
        }
    )


def _project_memory_signals(signals: list[AssistantMemorySignal]) -> list[dict[str, Any]]:
    projected: list[dict[str, Any]] = []
    for signal in signals:
        projected.append(
            {
                "id": signal.id,
                "scope": signal.scope,
                "signal_type": signal.signal_type,
                "signal_key": signal.signal_key,
                "signal_summary": signal.signal_summary,
                "signal_value": _make_json_safe(dict(signal.signal_value or {})),
                "status": signal.status,
                "expires_at": signal.expires_at.isoformat() if signal.expires_at else None,
            }
        )
    return _make_json_safe(projected)


def _project_recovery_preview(preview: dict[str, Any] | None) -> dict[str, Any]:
    if not preview:
        return {}
    return _make_json_safe(
        {
            "plan_version": preview.get("plan_version"),
            "schedule_revision": preview.get("schedule_revision"),
            "needs_recovery": preview.get("needs_recovery"),
            "recommended_action": preview.get("recommended_action"),
            "recommended_recovery_mode": preview.get("recommended_recovery_mode"),
            "overdue_items_count": preview.get("overdue_items_count"),
            "overdue_minutes": preview.get("overdue_minutes"),
            "recovery_pressure_ratio": preview.get("recovery_pressure_ratio"),
            "drift_level": preview.get("drift_level"),
            "available_actions": list(preview.get("available_actions") or []),
            "available_recovery_modes": list(preview.get("available_recovery_modes") or []),
        }
    )


def _fetch_next_actionable_item(db: Session, active_plan: Any) -> LearningPlanItem | None:
    if active_plan is None:
        return None
    next_item_id = dict(active_plan.plan_summary or {}).get("next_actionable_item_id")
    if next_item_id is None:
        return None
    return (
        db.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == active_plan.id)
        .filter(LearningPlanItem.id == next_item_id)
        .first()
    )


def _summarize_schedule_guidance_signals(signals: list[AssistantMemorySignal]) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "preferred_time_window": None,
        "temporary_unavailable_time_window": None,
        "active_learning_signal_concepts": [],
    }
    for signal in signals:
        value = dict(signal.signal_value or {})
        if signal.signal_key == "preferred_time_window" and summary["preferred_time_window"] is None:
            summary["preferred_time_window"] = value.get("time_window")
        elif signal.signal_key == "temporarily_unavailable_time_window" and summary["temporary_unavailable_time_window"] is None:
            summary["temporary_unavailable_time_window"] = value.get("time_window")
        elif signal.signal_key == "concept_help_requested":
            concept = value.get("concept")
            if concept and concept not in summary["active_learning_signal_concepts"]:
                summary["active_learning_signal_concepts"].append(concept)
    return _make_json_safe(summary)


def build_assistant_safe_context(db: Session, user_id: int) -> AssistantSafeContext:
    profile = get_user_profile(db=db, user_id=user_id)
    learning_state = get_user_learning_state(db=db, user_id=user_id)
    active_plan = get_active_learning_plan(db=db, user_id=user_id)

    preference = None
    plan_courses: list[Any] = []
    recovery_preview: dict[str, Any] = {}
    next_actionable_item: LearningPlanItem | None = None
    if active_plan is not None:
        refresh_plan_summary(db=db, plan=active_plan)
        preference = get_plan_preference(db=db, plan_id=active_plan.id)
        plan_courses = get_plan_courses(db=db, plan_id=active_plan.id)
        next_actionable_item = _fetch_next_actionable_item(db=db, active_plan=active_plan)
        try:
            recovery_preview = get_plan_recovery_preview(db=db, user_id=user_id, plan_id=active_plan.id)
        except AppException:
            recovery_preview = {}

    recent_events = (
        db.query(UserEvent)
        .filter(UserEvent.user_id == user_id)
        .order_by(UserEvent.id.desc())
        .limit(8)
        .all()
    )
    recent_events = list(reversed(recent_events))

    memory_signals = list_effective_memory_signals(db=db, user_id=user_id)[:10]
    recommendations = get_personalized_recommendations(db=db, user_id=user_id, limit=3)
    schedule_queue_items = list_schedule_queue_items(db=db, user_id=user_id)[:5]

    return AssistantSafeContext(
        profile=_project_profile(profile),
        learning_state=_project_learning_state(learning_state),
        active_plan=_project_plan_summary(active_plan, preference),
        active_plan_courses=_project_plan_courses(plan_courses),
        schedule_queue_courses=_project_schedule_queue_courses(schedule_queue_items),
        next_actionable_item=_project_next_actionable_item(next_actionable_item),
        recovery_preview=_project_recovery_preview(recovery_preview),
        recommendations=_project_recommendations(recommendations),
        recent_events=_project_recent_events(recent_events),
        active_memory_signals=_project_memory_signals(memory_signals),
        schedule_guidance_signals=_summarize_schedule_guidance_signals(memory_signals),
    )


def get_safe_plan_for_action_review(db: Session, user_id: int, plan_id: int | None = None) -> dict[str, Any]:
    plan = get_learning_plan_by_id(db=db, user_id=user_id, plan_id=plan_id) if plan_id is not None else None
    if plan is None:
        plan = get_active_learning_plan(db=db, user_id=user_id)
    if plan is None:
        raise NotFoundException("Active learning plan not found.")

    refresh_plan_summary(db=db, plan=plan)
    preference = get_plan_preference(db=db, plan_id=plan.id)
    return _project_plan_summary(plan, preference)
