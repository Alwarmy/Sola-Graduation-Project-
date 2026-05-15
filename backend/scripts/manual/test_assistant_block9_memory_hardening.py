from __future__ import annotations

from pprint import pprint
from typing import Any

import requests

from scripts.manual.verification_shared import (
    BASE_URL,
    TEST_PASSWORD,
    ensure_profile,
    get_shared_headers,
)


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> dict[str, Any] | list[dict[str, Any]]:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )
    if response.text:
        return response.json()
    return {}


def post(
    path: str,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    *,
    timeout: int = 120,
    expected_status: int | None = None,
) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}{path}",
        json=payload or {},
        headers=headers,
        timeout=timeout,
    )

    if expected_status is None:
        expected_status = 200 if path.endswith("/messages") or path.endswith("/confirm") else 201

    result = assert_status(response, expected_status)
    assert isinstance(result, dict)
    return result


def get(path: str, headers: dict[str, str] | None = None, *, timeout: int = 120) -> dict[str, Any] | list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}{path}",
        headers=headers,
        timeout=timeout,
    )
    return assert_status(response, 200)


def confirm_signal(headers: dict[str, str], signal_id: int) -> dict[str, Any]:
    return post(f"/assistant/memory-signals/{signal_id}/confirm", headers=headers, expected_status=200)


def register_and_login() -> dict[str, str]:
    section("REGISTER AND LOGIN")
    return get_shared_headers(
        "assistant_block9_memory_hardening",
        full_name="SOLA Assistant Block9 Memory Hardening",
        password=TEST_PASSWORD,
    )


def create_profile(headers: dict[str, str]) -> None:
    section("CREATE PROFILE")
    profile = ensure_profile(
        headers,
        {
            "background_track": "software_engineering",
            "primary_track": "data_science",
            "secondary_tracks": ["ai_ml"],
            "target_role": "ML Engineer",
            "experience_level": "beginner",
            "employment_status": "employed",
            "is_student": False,
            "education_major": "Software Engineering",
            "weekly_hours": 8,
            "goal": "job",
            "preferred_language": "en",
            "bio": "I want a practical AI path.",
            "timezone": "Asia/Riyadh",
        },
    )
    assert profile["timezone"] == "Asia/Riyadh"


def try_optional_ingestion(headers: dict[str, str]) -> dict[str, Any]:
    section("OPTIONAL INGEST COURSES")
    response = requests.post(
        f"{BASE_URL}/courses/ingest",
        headers=headers,
        json={
            "query": "python machine learning tutorial playlist",
            "max_results_per_type": 20,
        },
        timeout=180,
    )

    if response.status_code == 201:
        payload = response.json()
        assert payload["total_promoted_courses"] >= 0
        print("Optional ingestion succeeded.")
        return {
            "attempted": True,
            "succeeded": True,
            "skipped_due_to_provider": False,
            "details": payload,
        }

    if response.status_code in {403, 429, 500, 502, 503, 504}:
        print("Optional ingestion skipped because external provider is unavailable.")
        print(f"Provider status: {response.status_code}")
        print(f"Provider response: {response.text[:300]}")
        return {
            "attempted": True,
            "succeeded": False,
            "skipped_due_to_provider": True,
            "details": {
                "status_code": response.status_code,
                "response_text": response.text[:300],
            },
        }

    payload = assert_status(response, 201)
    assert isinstance(payload, dict)
    return {
        "attempted": True,
        "succeeded": True,
        "skipped_due_to_provider": False,
        "details": payload,
    }


def main() -> None:
    section("CHECK SERVER")
    root = get("/")
    assert isinstance(root, dict)
    assert root["message"] == "SOLA backend is running"

    headers = register_and_login()
    create_profile(headers)

    ingestion_result = try_optional_ingestion(headers=headers)

    section("CREATE CONVERSATION")
    conversation = post(
        "/assistant/conversations",
        {"title": "Block 9 memory hardening verification"},
        headers=headers,
        expected_status=201,
    )
    conversation_id = conversation["id"]

    section("CONFIRM INITIAL DURABLE PREFERENCE")
    first_exchange = post(
        f"/assistant/conversations/{conversation_id}/messages",
        {"content": "I study best in the morning."},
        headers=headers,
        expected_status=200,
    )
    first_signal_id = first_exchange["memory_candidates"][0]["id"]
    first_signal = confirm_signal(headers, first_signal_id)
    assert first_signal["status"] == "active"

    section("CONFIRM OVERRIDING DURABLE PREFERENCE")
    second_exchange = post(
        f"/assistant/conversations/{conversation_id}/messages",
        {"content": "Actually I study best in the evening now."},
        headers=headers,
        expected_status=200,
    )
    second_signal_id = second_exchange["memory_candidates"][0]["id"]
    second_signal = confirm_signal(headers, second_signal_id)
    assert second_signal["status"] == "active"

    section("CONFIRM TEMPORARY CONSTRAINT")
    third_exchange = post(
        f"/assistant/conversations/{conversation_id}/messages",
        {"content": "This week I am busy at night."},
        headers=headers,
        expected_status=200,
    )
    third_signal_id = third_exchange["memory_candidates"][0]["id"]
    third_signal = confirm_signal(headers, third_signal_id)
    assert third_signal["status"] == "active"

    section("CONFIRM GENERIC LEARNING SIGNAL")
    concept_exchange = post(
        f"/assistant/conversations/{conversation_id}/messages",
        {"content": "I do not understand React state management yet."},
        headers=headers,
        expected_status=200,
    )
    concept_signal_id = concept_exchange["memory_candidates"][0]["id"]
    concept_signal = confirm_signal(headers, concept_signal_id)
    assert concept_signal["status"] == "active"
    assert concept_signal["signal_value"]["concept"] == "react state management"

    section("READ EFFECTIVE MEMORY SIGNALS")
    effective_signals = get("/assistant/memory-signals?effective_only=true", headers=headers)
    assert isinstance(effective_signals, list)
    assert effective_signals, "Expected effective signals."

    effective_map = {signal["signal_key"]: signal for signal in effective_signals}
    assert effective_map["preferred_time_window"]["signal_value"]["time_window"] == "evening"
    assert effective_map["temporarily_unavailable_time_window"]["signal_value"]["time_window"] == "night"
    assert effective_map["concept_help_requested"]["signal_value"]["concept"] == "react state management"

    section("READ FULL MEMORY SIGNAL HISTORY")
    all_signals = get("/assistant/memory-signals", headers=headers)
    assert isinstance(all_signals, list)
    preferred_signals = [signal for signal in all_signals if signal["signal_key"] == "preferred_time_window"]
    assert len(preferred_signals) >= 2
    assert any(signal["status"] == "dismissed" for signal in preferred_signals)
    assert any(signal["status"] == "active" for signal in preferred_signals)

    section("READ CONFIRMATION EVENTS")
    events = get("/events?event_type=assistant_memory_signal_confirmed&limit=20", headers=headers)
    assert isinstance(events, list)
    assert events, "Expected assistant confirmation events."
    assert any(event["event_payload"].get("signal_key") == "concept_help_requested" for event in events)

    section("SEND MEMORY-AWARE FOLLOW-UP")
    follow_up = post(
        f"/assistant/conversations/{conversation_id}/messages",
        {"content": "My schedule is still not suitable."},
        headers=headers,
        expected_status=200,
    )
    remembered_signals = follow_up["used_context_summary"]["remembered_schedule_signals"]
    assert remembered_signals["preferred_time_window"] == "evening"
    assert remembered_signals["temporary_unavailable_time_window"] == "night"

    section("BLOCK 9 MEMORY HARDENING PASSED")
    pprint(
        {
            "conversation_id": conversation_id,
            "optional_ingestion": ingestion_result,
            "effective_signal_count": len(effective_signals),
            "remembered_schedule_signals": remembered_signals,
            "concept_signal": concept_signal["signal_value"],
        }
    )


if __name__ == "__main__":
    main()