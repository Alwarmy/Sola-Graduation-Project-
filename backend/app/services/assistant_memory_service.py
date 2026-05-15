from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.models.assistant_memory_signal import AssistantMemorySignal
from app.schemas.assistant import ASSISTANT_MEMORY_SCOPE_OPTIONS, ASSISTANT_MEMORY_STATUS_OPTIONS
from app.services.assistant_concept_utils import extract_requested_concept
from app.services.user_event_service import create_system_user_event

ARABIC_PATTERN = re.compile(r"[؀-ۿ]")
TEMPORARY_HINTS = {"this week", "this month", "حالياً", "حاليا", "هذا الأسبوع", "هذا الاسبوع", "مؤقت", "temporarily"}
NIGHT_HINTS = {"night", "ليل", "بالليل", "ليلاً", "ليلا"}
MORNING_HINTS = {"morning", "صباح", "الصباح"}
EVENING_HINTS = {"evening", "مساء", "المساء"}
DAY_HINTS = {"day", "نهار", "النهار"}
ACTIVE_SIGNAL_STATUSES = {"active", "confirmed", "proposed"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_message(message: str) -> str:
    return " ".join(message.lower().split())


def _contains_any(text: str, patterns: set[str]) -> bool:
    return any(pattern in text for pattern in patterns)


def _detect_time_window(text: str) -> str | None:
    if _contains_any(text, NIGHT_HINTS):
        return "night"
    if _contains_any(text, MORNING_HINTS):
        return "morning"
    if _contains_any(text, EVENING_HINTS):
        return "evening"
    if _contains_any(text, DAY_HINTS):
        return "afternoon"
    return None


def _build_signal_resolution_key(scope: str, signal_key: str, signal_value: dict[str, Any]) -> str:
    if signal_key == "concept_help_requested":
        concept = (signal_value or {}).get("concept") or "generic"
        return f"{scope}:{signal_key}:{concept}"
    return f"{scope}:{signal_key}"


def _is_signal_expired(signal: AssistantMemorySignal, *, now: datetime | None = None) -> bool:
    now = now or _now_utc()
    return signal.expires_at is not None and signal.expires_at <= now


def _sort_signals_for_resolution(signals: Iterable[AssistantMemorySignal]) -> list[AssistantMemorySignal]:
    status_rank = {"active": 0, "confirmed": 1, "proposed": 2, "dismissed": 3, "expired": 4}
    return sorted(
        signals,
        key=lambda signal: (
            status_rank.get(signal.status, 99),
            -(signal.updated_at.timestamp() if signal.updated_at else 0),
            -signal.id,
        ),
    )


def _select_effective_signals(signals: Iterable[AssistantMemorySignal]) -> list[AssistantMemorySignal]:
    effective: dict[str, AssistantMemorySignal] = {}
    for signal in _sort_signals_for_resolution(signals):
        if signal.status not in {"active", "confirmed"}:
            continue
        if _is_signal_expired(signal):
            continue
        key = _build_signal_resolution_key(signal.scope, signal.signal_key, dict(signal.signal_value or {}))
        effective.setdefault(key, signal)
    return list(effective.values())


def _expire_stale_signals(db: Session, user_id: int) -> list[AssistantMemorySignal]:
    now = _now_utc()
    stale_signals = (
        db.query(AssistantMemorySignal)
        .filter(AssistantMemorySignal.user_id == user_id)
        .filter(AssistantMemorySignal.status.in_(list(ACTIVE_SIGNAL_STATUSES | {"active", "confirmed"})))
        .filter(AssistantMemorySignal.expires_at.isnot(None))
        .all()
    )

    expired: list[AssistantMemorySignal] = []
    for signal in stale_signals:
        if signal.expires_at and signal.expires_at <= now and signal.status != "expired":
            signal.status = "expired"
            expired.append(signal)
            create_system_user_event(
                db=db,
                user_id=user_id,
                event_type="assistant_memory_signal_expired",
                event_payload={"signal_key": signal.signal_key, "scope": signal.scope},
                commit=False,
                refresh_learning_state_after=False,
            )
    return expired


def _supersede_conflicting_signals(db: Session, *, user_id: int, confirmed_signal: AssistantMemorySignal) -> list[AssistantMemorySignal]:
    resolution_key = _build_signal_resolution_key(
        confirmed_signal.scope,
        confirmed_signal.signal_key,
        dict(confirmed_signal.signal_value or {}),
    )
    candidate_signals = (
        db.query(AssistantMemorySignal)
        .filter(AssistantMemorySignal.user_id == user_id)
        .filter(AssistantMemorySignal.id != confirmed_signal.id)
        .filter(AssistantMemorySignal.status.in_(list(ACTIVE_SIGNAL_STATUSES | {"active", "confirmed"})))
        .filter(AssistantMemorySignal.scope == confirmed_signal.scope)
        .filter(AssistantMemorySignal.signal_key == confirmed_signal.signal_key)
        .all()
    )

    superseded: list[AssistantMemorySignal] = []
    for signal in candidate_signals:
        candidate_key = _build_signal_resolution_key(signal.scope, signal.signal_key, dict(signal.signal_value or {}))
        if candidate_key == resolution_key and dict(signal.signal_value or {}) == dict(confirmed_signal.signal_value or {}):
            continue
        signal.status = "dismissed"
        signal.signal_metadata = {
            **dict(signal.signal_metadata or {}),
            "superseded_by_signal_id": confirmed_signal.id,
            "superseded_at": _now_utc().isoformat(),
        }
        superseded.append(signal)
        create_system_user_event(
            db=db,
            user_id=user_id,
            event_type="assistant_memory_signal_superseded",
            event_payload={
                "signal_key": signal.signal_key,
                "scope": signal.scope,
                "superseded_by_signal_id": confirmed_signal.id,
            },
            commit=False,
            refresh_learning_state_after=False,
        )
    return superseded


def _build_signal_payloads(message: str) -> list[dict[str, Any]]:
    lowered = _normalize_message(message)
    signals: list[dict[str, Any]] = []

    time_window = _detect_time_window(lowered)
    if time_window and any(token in lowered for token in ["اشتغل", "أشتغل", "work", "busy", "مشغول", "دوام", "study"]):
        is_temporary = any(hint in lowered for hint in TEMPORARY_HINTS)
        scope = "temporary_constraint" if is_temporary else "durable_preference"
        signal_key = "temporarily_unavailable_time_window" if is_temporary else "preferred_time_window"
        summary = (
            f"Temporary constraint indicates {time_window} is not a good study window right now."
            if not ARABIC_PATTERN.search(message)
            else f"يوجد قيد مؤقت يشير إلى أن وقت {time_window} غير مناسب للدراسة حاليًا."
        )
        if not is_temporary:
            summary = (
                f"Study-time preference suggests {time_window} works best."
                if not ARABIC_PATTERN.search(message)
                else f"تفضيل الدراسة يشير إلى أن وقت {time_window} هو الأنسب لك."
            )

        signals.append(
            {
                "signal_type": "schedule_preference",
                "signal_key": signal_key,
                "signal_summary": summary,
                "signal_value": {"time_window": time_window},
                "signal_metadata": {"source": "assistant_chat_message"},
                "scope": scope,
                "confidence_score": 0.82 if is_temporary else 0.88,
                "expires_at": _now_utc() + timedelta(days=14) if is_temporary else None,
            }
        )

    concept_label = extract_requested_concept(message)
    if concept_label:
        summary = (
            f'Learning support signal shows the user asked for help with "{concept_label}".'
            if not ARABIC_PATTERN.search(message)
            else f'إشارة تعلم توضح أن المستخدم طلب مساعدة في مفهوم "{concept_label}".'
        )
        signals.append(
            {
                "signal_type": "learning_support_signal",
                "signal_key": "concept_help_requested",
                "signal_summary": summary,
                "signal_value": {"concept": concept_label},
                "signal_metadata": {"source": "assistant_chat_message"},
                "scope": "learning_signal",
                "confidence_score": 0.9,
                "expires_at": None,
            }
        )

    return signals


def list_effective_memory_signals(db: Session, user_id: int) -> list[AssistantMemorySignal]:
    _expire_stale_signals(db=db, user_id=user_id)
    signals = (
        db.query(AssistantMemorySignal)
        .filter(AssistantMemorySignal.user_id == user_id)
        .order_by(AssistantMemorySignal.updated_at.desc(), AssistantMemorySignal.id.desc())
        .all()
    )
    return _select_effective_signals(signals)


def list_memory_signals(
    db: Session,
    user_id: int,
    *,
    status_filter: str | None = None,
    effective_only: bool = False,
    conversation_id: int | None = None,
) -> list[AssistantMemorySignal]:
    _expire_stale_signals(db=db, user_id=user_id)

    if effective_only:
        signals = list_effective_memory_signals(db=db, user_id=user_id)
        if conversation_id is not None:
            signals = [signal for signal in signals if signal.conversation_id == conversation_id]
        if status_filter is not None:
            if status_filter not in ASSISTANT_MEMORY_STATUS_OPTIONS:
                raise ValidationException("Invalid assistant memory status filter.")
            signals = [signal for signal in signals if signal.status == status_filter]
        return sorted(signals, key=lambda signal: (signal.updated_at, signal.id), reverse=True)

    query = (
        db.query(AssistantMemorySignal)
        .filter(AssistantMemorySignal.user_id == user_id)
        .order_by(AssistantMemorySignal.updated_at.desc(), AssistantMemorySignal.id.desc())
    )

    if status_filter is not None:
        if status_filter not in ASSISTANT_MEMORY_STATUS_OPTIONS:
            raise ValidationException("Invalid assistant memory status filter.")
        query = query.filter(AssistantMemorySignal.status == status_filter)

    if conversation_id is not None:
        query = query.filter(AssistantMemorySignal.conversation_id == conversation_id)

    return query.all()


def extract_memory_candidates_from_message(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    source_message_id: int,
    message_content: str,
) -> list[AssistantMemorySignal]:
    payloads = _build_signal_payloads(message_content)
    created: list[AssistantMemorySignal] = []

    for payload in payloads:
        if payload["scope"] not in ASSISTANT_MEMORY_SCOPE_OPTIONS:
            raise ValidationException("Invalid assistant memory scope.")

        existing = (
            db.query(AssistantMemorySignal)
            .filter(AssistantMemorySignal.user_id == user_id)
            .filter(AssistantMemorySignal.signal_key == payload["signal_key"])
            .filter(AssistantMemorySignal.scope == payload["scope"])
            .filter(AssistantMemorySignal.status.in_(list(ACTIVE_SIGNAL_STATUSES)))
            .order_by(AssistantMemorySignal.id.desc())
            .first()
        )

        if existing and dict(existing.signal_value or {}) == dict(payload["signal_value"]):
            created.append(existing)
            continue

        signal = AssistantMemorySignal(
            user_id=user_id,
            conversation_id=conversation_id,
            source_message_id=source_message_id,
            signal_type=payload["signal_type"],
            signal_key=payload["signal_key"],
            signal_summary=payload["signal_summary"],
            signal_value=payload["signal_value"],
            signal_metadata=payload["signal_metadata"],
            scope=payload["scope"],
            confidence_score=payload["confidence_score"],
            status="proposed",
            effective_from=None,
            expires_at=payload["expires_at"],
        )
        db.add(signal)
        db.flush()
        created.append(signal)

    return created


def get_memory_signal_by_id(db: Session, user_id: int, signal_id: int) -> AssistantMemorySignal:
    signal = (
        db.query(AssistantMemorySignal)
        .filter(AssistantMemorySignal.user_id == user_id)
        .filter(AssistantMemorySignal.id == signal_id)
        .first()
    )
    if not signal:
        raise NotFoundException("Assistant memory signal not found.")
    return signal


def confirm_memory_signal(db: Session, user_id: int, signal_id: int) -> AssistantMemorySignal:
    signal = get_memory_signal_by_id(db=db, user_id=user_id, signal_id=signal_id)

    if signal.status in {"confirmed", "active"}:
        raise ConflictException("Assistant memory signal is already confirmed.")

    _expire_stale_signals(db=db, user_id=user_id)

    signal.status = "active"
    signal.effective_from = _now_utc()
    _supersede_conflicting_signals(db=db, user_id=user_id, confirmed_signal=signal)

    create_system_user_event(
        db=db,
        user_id=user_id,
        event_type="assistant_memory_signal_confirmed",
        event_payload={
            "signal_key": signal.signal_key,
            "scope": signal.scope,
            "signal_type": signal.signal_type,
            "signal_value": dict(signal.signal_value or {}),
        },
        commit=False,
        refresh_learning_state_after=signal.scope == "learning_signal",
    )

    db.commit()
    db.refresh(signal)
    return signal
