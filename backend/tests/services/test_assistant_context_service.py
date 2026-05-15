from datetime import datetime, timezone

from app.services.assistant_context_service import _build_safe_event_payload, _project_recent_events


class DummyEvent:
    def __init__(self, event_type: str, event_payload: dict):
        self.event_type = event_type
        self.event_payload = event_payload
        self.created_at = datetime.now(timezone.utc)



def test_build_safe_event_payload_redacts_unlisted_keys() -> None:
    event = DummyEvent(
        "search_performed",
        {"query": "python", "token": "secret", "debug": True},
    )
    payload = _build_safe_event_payload(event)
    assert payload == {"query": "python"}



def test_project_recent_events_keeps_safe_shape() -> None:
    event = DummyEvent(
        "course_selected",
        {"course_id": 4, "course_title": "Python", "internal": "secret"},
    )
    projected = _project_recent_events([event])
    assert projected[0]["event_payload"] == {"course_id": 4, "course_title": "Python"}



def test_build_safe_event_payload_keeps_assistant_signal_confirmation_payload() -> None:
    event = DummyEvent(
        "assistant_memory_signal_confirmed",
        {
            "signal_key": "preferred_time_window",
            "scope": "durable_preference",
            "signal_type": "schedule_preference",
            "signal_value": {"time_window": "morning"},
            "internal": "secret",
        },
    )
    payload = _build_safe_event_payload(event)
    assert payload["signal_key"] == "preferred_time_window"
    assert payload["signal_value"] == {"time_window": "morning"}
    assert "internal" not in payload
