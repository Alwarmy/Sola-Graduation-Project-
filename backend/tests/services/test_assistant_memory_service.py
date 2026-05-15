from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.services.assistant_memory_service import (
    _build_signal_payloads,
    _build_signal_resolution_key,
    _select_effective_signals,
)


@dataclass
class DummySignal:
    id: int
    scope: str
    signal_key: str
    signal_value: dict
    status: str
    updated_at: datetime
    expires_at: datetime | None = None


def test_build_signal_payloads_extracts_durable_time_preference() -> None:
    payloads = _build_signal_payloads("I study best in the morning.")
    assert any(payload["signal_key"] == "preferred_time_window" for payload in payloads)


def test_build_signal_payloads_extracts_temporary_constraint() -> None:
    payloads = _build_signal_payloads("This week I am busy at night.")
    assert any(payload["scope"] == "temporary_constraint" for payload in payloads)


def test_build_signal_payloads_extracts_generic_learning_signal() -> None:
    payloads = _build_signal_payloads("I do not understand React state management yet.")
    assert any(
        payload["signal_key"] == "concept_help_requested"
        and payload["signal_value"]["concept"] == "react state management"
        for payload in payloads
    )


def test_build_signal_resolution_key_distinguishes_learning_signal_concepts() -> None:
    react_key = _build_signal_resolution_key(
        "learning_signal",
        "concept_help_requested",
        {"concept": "react state management"},
    )
    regression_key = _build_signal_resolution_key(
        "learning_signal",
        "concept_help_requested",
        {"concept": "linear regression"},
    )
    assert react_key != regression_key


def test_select_effective_signals_prefers_latest_active_signal_per_resolution_key() -> None:
    now = datetime.now(timezone.utc)
    signals = [
        DummySignal(
            id=1,
            scope="durable_preference",
            signal_key="preferred_time_window",
            signal_value={"time_window": "morning"},
            status="active",
            updated_at=now - timedelta(days=1),
        ),
        DummySignal(
            id=2,
            scope="durable_preference",
            signal_key="preferred_time_window",
            signal_value={"time_window": "evening"},
            status="active",
            updated_at=now,
        ),
    ]
    effective = _select_effective_signals(signals)
    assert len(effective) == 1
    assert effective[0].signal_value["time_window"] == "evening"


def test_select_effective_signals_ignores_expired_temporary_signal() -> None:
    now = datetime.now(timezone.utc)
    signals = [
        DummySignal(
            id=1,
            scope="temporary_constraint",
            signal_key="temporarily_unavailable_time_window",
            signal_value={"time_window": "night"},
            status="active",
            updated_at=now,
            expires_at=now - timedelta(hours=1),
        )
    ]
    effective = _select_effective_signals(signals)
    assert effective == []
