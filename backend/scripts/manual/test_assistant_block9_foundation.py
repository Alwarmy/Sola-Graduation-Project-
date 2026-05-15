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
        expected_status = 200 if path.endswith("/messages") or path.endswith("/confirm") or path.endswith("/build") else 201

    result = assert_status(response, expected_status)
    assert isinstance(result, dict)
    return result


def get(
    path: str,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    *,
    timeout: int = 120,
) -> dict[str, Any] | list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}{path}",
        headers=headers,
        params=params,
        timeout=timeout,
    )
    return assert_status(response, 200)


def register_and_login() -> dict[str, str]:
    section("REGISTER AND LOGIN")
    return get_shared_headers(
        "assistant_block9_foundation",
        full_name="SOLA Assistant Block9 Foundation",
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


def ensure_existing_catalog(headers: dict[str, str]) -> dict[str, Any]:
    section("FALLBACK CATALOG CHECK")
    catalog = get(
        "/courses",
        headers=headers,
        params={"language": "en", "limit": 20, "sort_by": "quality"},
    )
    assert isinstance(catalog, list) and catalog, (
        "Expected existing catalog courses when provider ingestion is unavailable."
    )
    return {
        "count": len(catalog),
        "sample_course_id": catalog[0]["id"],
    }


def main() -> None:
    section("CHECK SERVER")
    root = get("/")
    assert isinstance(root, dict)
    assert root["message"] == "SOLA backend is running"

    headers = register_and_login()
    create_profile(headers)

    ingestion_result = try_optional_ingestion(headers=headers)
    fallback_catalog = None
    if not ingestion_result["succeeded"]:
        fallback_catalog = ensure_existing_catalog(headers=headers)

    section("CREATE CONVERSATION")
    conversation = post(
        "/assistant/conversations",
        {"title": "Block 9 foundation verification"},
        headers=headers,
        expected_status=201,
    )
    conversation_id = conversation["id"]

    section("SEND SCHEDULE PREFERENCE MESSAGE")
    schedule_exchange = post(
        f"/assistant/conversations/{conversation_id}/messages",
        {"content": "Please remember that evenings work best for my study sessions and nights are not suitable."},
        headers=headers,
        expected_status=200,
    )
    assert schedule_exchange["response_mode"] == "assistant_insufficient_schedule_context"
    assert schedule_exchange["memory_candidates"], "Expected assistant memory candidates."
    assert schedule_exchange["governance"]["blocking_reason"] == "insufficient_schedule_context"
    assert schedule_exchange["suggested_actions"] == []

    first_signal_id = schedule_exchange["memory_candidates"][0]["id"]

    section("CONFIRM MEMORY SIGNAL")
    confirmed_signal = post(
        f"/assistant/memory-signals/{first_signal_id}/confirm",
        headers=headers,
        expected_status=200,
    )
    assert confirmed_signal["status"] == "active"

    section("SEND NEXT-COURSE GUIDANCE MESSAGE")
    next_step_exchange = post(
        f"/assistant/conversations/{conversation_id}/messages",
        {"content": "What should I study after Python?"},
        headers=headers,
        expected_status=200,
    )
    assert next_step_exchange["response_mode"] == "grounded_next_step_guidance"
    assert next_step_exchange["grounded_entities"], "Expected grounded course entity."

    section("READ MEMORY SIGNALS")
    memory_signals = get("/assistant/memory-signals", headers=headers)
    assert isinstance(memory_signals, list)
    assert memory_signals, "Expected stored assistant memory signals."

    section("READ CONVERSATION DETAIL")
    conversation_detail = get(
        f"/assistant/conversations/{conversation_id}",
        headers=headers,
    )
    assert isinstance(conversation_detail, dict)
    assert conversation_detail["message_count"] >= 4

    section("BLOCK 9 FOUNDATION PASSED")
    pprint(
        {
            "conversation_id": conversation_id,
            "optional_ingestion": ingestion_result,
            "schedule_response_mode": schedule_exchange["response_mode"],
            "schedule_blocking_reason": schedule_exchange["governance"]["blocking_reason"],
            "next_step_response_mode": next_step_exchange["response_mode"],
            "memory_signal_status": confirmed_signal["status"],
            "memory_signal_count": len(memory_signals),
            "grounded_entities_count": len(next_step_exchange["grounded_entities"]),
            "fallback_catalog": fallback_catalog,
        }
    )


if __name__ == "__main__":
    main()