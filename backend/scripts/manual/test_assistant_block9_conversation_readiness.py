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


def post(
    path: str,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    *,
    timeout: int = 120,
    expected_status: int = 200,
) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}{path}",
        json=payload or {},
        headers=headers,
        timeout=timeout,
    )
    result = assert_status(response, expected_status)
    assert isinstance(result, dict)
    return result


def register_and_login() -> dict[str, str]:
    section("REGISTER AND LOGIN")
    return get_shared_headers(
        "assistant_block9_6_conversation_readiness",
        full_name="SOLA Assistant Block9 6 Conversation Readiness",
        password=TEST_PASSWORD,
    )


def create_profile(headers: dict[str, str]) -> dict[str, Any]:
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
            "bio": "I want practical machine learning guidance.",
            "timezone": "Asia/Riyadh",
        },
    )
    assert profile["timezone"] == "Asia/Riyadh"
    return profile


def create_conversation(headers: dict[str, str], title: str) -> dict[str, Any]:
    section("CREATE CONVERSATION")
    conversation = post(
        "/assistant/conversations",
        payload={"title": title},
        headers=headers,
        expected_status=201,
        timeout=60,
    )
    assert conversation["id"]
    return conversation


def send_message(headers: dict[str, str], conversation_id: int, content: str) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/assistant/conversations/{conversation_id}/messages",
        headers=headers,
        json={"content": content},
        timeout=120,
    )
    payload = assert_status(response, 200)
    assert isinstance(payload, dict)
    return payload


def main() -> None:
    section("CHECK SERVER")
    root = get("/")
    assert isinstance(root, dict)
    assert root["message"] == "SOLA backend is running"

    headers = register_and_login()
    create_profile(headers)

    me = get("/auth/me", headers=headers)
    assert isinstance(me, dict)
    user_id = me["id"]

    conversation = create_conversation(headers, "Assistant block 9.6 conversation readiness")
    conversation_id = conversation["id"]

    section("VERIFY NEW CONVERSATION DETAIL")
    initial_detail = get(f"/assistant/conversations/{conversation_id}", headers=headers)
    assert isinstance(initial_detail, dict)
    assert initial_detail["id"] == conversation_id
    assert initial_detail["message_count"] == 0

    section("VERIFY CONVERSATION APPEARS IN LIST")
    initial_conversations = get("/assistant/conversations", headers=headers)
    assert isinstance(initial_conversations, list)
    listed_initial = next((item for item in initial_conversations if item["id"] == conversation_id), None)
    assert listed_initial is not None

    section("SEND FIRST READINESS MESSAGE")
    first_exchange = send_message(
        headers,
        conversation_id,
        "I need help with my learning plan today, but I have not started one yet.",
    )
    assert first_exchange["response_mode"] == "assistant_no_active_plan"
    assert first_exchange["governance"]["status"] == "bounded"
    assert first_exchange["governance"]["blocking_reason"] == "no_active_plan"
    assert first_exchange["follow_up_questions"]
    assert first_exchange["suggested_actions"] == []

    section("SEND SECOND READINESS MESSAGE")
    second_exchange = send_message(
        headers,
        conversation_id,
        "I still do not understand this topic clearly.",
    )
    assert second_exchange["response_mode"] == "assistant_ambiguous_concept_help"
    assert second_exchange["governance"]["status"] == "bounded"
    assert second_exchange["governance"]["blocking_reason"] == "ambiguous_concept_request"
    assert second_exchange["follow_up_questions"]
    assert second_exchange["suggested_actions"] == []

    section("VERIFY CONVERSATION DETAIL AFTER EXCHANGES")
    final_detail = get(f"/assistant/conversations/{conversation_id}", headers=headers)
    assert isinstance(final_detail, dict)
    assert final_detail["id"] == conversation_id
    assert final_detail["message_count"] == 4

    section("VERIFY CONVERSATION LISTING AFTER EXCHANGES")
    final_conversations = get("/assistant/conversations", headers=headers)
    assert isinstance(final_conversations, list)
    listed_final = next((item for item in final_conversations if item["id"] == conversation_id), None)
    assert listed_final is not None

    section("ASSISTANT BLOCK 9.6 CONVERSATION READINESS PASSED")
    pprint(
        {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "initial_message_count": initial_detail["message_count"],
            "final_message_count": final_detail["message_count"],
            "first_response_mode": first_exchange["response_mode"],
            "second_response_mode": second_exchange["response_mode"],
        }
    )


if __name__ == "__main__":
    main()