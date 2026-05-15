from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.exceptions import ValidationException
from app.models.user_event import UserEvent
from app.schemas.user_event import USER_EVENT_TYPES, UserEventCreate
from app.services.user_learning_state_service import refresh_user_learning_state


AUTO_REFRESH_EVENT_TYPES = {
    "search_performed",
    "recommendation_clicked",
    "course_opened",
    "course_saved",
    "course_selected",
    "course_dismissed",
    "profile_updated",
    "plan_created",
    "plan_item_started",
    "plan_item_completed",
    "plan_item_delayed",
    "plan_item_skipped",
    "assistant_memory_signal_confirmed",
}


def validate_event_type(event_type: str) -> None:
    if event_type not in USER_EVENT_TYPES:
        raise ValidationException("Invalid event_type.")


def _should_refresh_learning_state(event_type: str) -> bool:
    return event_type in AUTO_REFRESH_EVENT_TYPES


def _persist_user_event(
    db: Session,
    user_id: int,
    event_type: str,
    event_payload: dict | None = None,
    *,
    commit: bool,
    refresh_learning_state_after: bool,
) -> UserEvent:
    validate_event_type(event_type)

    event = UserEvent(
        user_id=user_id,
        event_type=event_type,
        event_payload=event_payload or {},
    )

    db.add(event)
    db.flush()

    if refresh_learning_state_after and _should_refresh_learning_state(event_type):
        refresh_user_learning_state(db=db, user_id=user_id)

    if commit:
        db.commit()
        db.refresh(event)

    return event


def create_user_event(
    db: Session,
    user_id: int,
    payload: UserEventCreate,
) -> UserEvent:
    return _persist_user_event(
        db=db,
        user_id=user_id,
        event_type=payload.event_type,
        event_payload=payload.event_payload or {},
        commit=True,
        refresh_learning_state_after=True,
    )


def create_system_user_event(
    db: Session,
    user_id: int,
    event_type: str,
    event_payload: dict | None = None,
    *,
    commit: bool = False,
    refresh_learning_state_after: bool = True,
) -> UserEvent:
    return _persist_user_event(
        db=db,
        user_id=user_id,
        event_type=event_type,
        event_payload=event_payload or {},
        commit=commit,
        refresh_learning_state_after=refresh_learning_state_after,
    )


def list_user_events(
    db: Session,
    user_id: int,
    event_type: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[UserEvent]:
    query = db.query(UserEvent).filter(UserEvent.user_id == user_id)

    if event_type:
        validate_event_type(event_type)
        query = query.filter(UserEvent.event_type == event_type)

    events = (
        query.order_by(UserEvent.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return events
