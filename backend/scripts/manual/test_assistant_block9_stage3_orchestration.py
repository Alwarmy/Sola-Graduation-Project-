from __future__ import annotations

from datetime import timedelta
from pprint import pprint
from typing import Any

import requests

from app.core.timezone_utils import get_local_date
from app.db.session import new_session
from app.models.learning_plan_item import LearningPlanItem
from scripts.manual.verification_shared import (
    BASE_URL,
    TEST_PASSWORD,
    ensure_profile,
    get_shared_headers,
)

EXPECTED_VERSION_HEADER = "X-Expected-Version"


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> dict[str, Any] | list[dict[str, Any]]:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )
    if response.text:
        return response.json()
    return {}


def with_expected_version(headers: dict[str, str], version: int) -> dict[str, str]:
    merged = dict(headers)
    merged[EXPECTED_VERSION_HEADER] = str(version)
    return merged


def post(
    path: str,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    *,
    timeout: int = 120,
) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}{path}",
        json=payload or {},
        headers=headers,
        timeout=timeout,
    )
    expected_status = 200 if any(
        path.endswith(suffix)
        for suffix in ("/confirm", "/start", "/complete", "/skip", "/build", "/recover", "/generate")
    ) else 201
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


def register_and_login() -> tuple[dict[str, str], int]:
    section("REGISTER AND LOGIN")
    headers = get_shared_headers(
        "assistant_block9_stage3_orchestration",
        full_name="SOLA Assistant Block9 Stage3 Orchestration",
        password=TEST_PASSWORD,
    )
    me = get("/auth/me", headers=headers)
    assert isinstance(me, dict)
    return headers, me["id"]


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
            "bio": "I want practical machine learning guidance.",
            "timezone": "Asia/Riyadh",
        },
    )
    assert profile["timezone"] == "Asia/Riyadh"


def _try_optional_ingestion(headers: dict[str, str]) -> dict[str, Any]:
    section("OPTIONAL INGEST COURSES")
    response = requests.post(
        f"{BASE_URL}/courses/ingest",
        headers=headers,
        json={"query": "python machine learning tutorial", "max_results_per_type": 12},
        timeout=180,
    )
    if response.status_code == 201:
        payload = response.json()
        print("Optional ingestion succeeded.")
        return {
            "attempted": True,
            "succeeded": True,
            "skipped_due_to_provider": False,
            "payload": payload,
        }

    if response.status_code in {403, 429, 500, 502, 503, 504}:
        print("Optional ingestion skipped because external provider is unavailable.")
        print(f"Provider status: {response.status_code}")
        print(f"Provider response: {response.text[:300]}")
        return {
            "attempted": True,
            "succeeded": False,
            "skipped_due_to_provider": True,
            "payload": {
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
        "payload": payload,
    }


def _choose_existing_course(headers: dict[str, str]) -> int:
    section("FALLBACK PICK FROM EXISTING CATALOG")
    catalog = get(
        "/courses",
        headers=headers,
        params={"language": "en", "limit": 50, "sort_by": "quality"},
        timeout=120,
    )
    assert isinstance(catalog, list) and catalog, "Expected existing catalog courses when provider ingestion is unavailable."

    preferred = next(
        (
            course
            for course in catalog
            if course.get("source") == "youtube" and course.get("content_type") in {"playlist", "video"}
        ),
        None,
    )
    selected = preferred or catalog[0]
    assert selected["id"], "Expected a valid fallback course id."
    return selected["id"]


def ingest_and_choose_course(headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    ingestion_result = _try_optional_ingestion(headers)
    payload = ingestion_result["payload"]

    if ingestion_result["succeeded"] and payload.get("courses"):
        return payload["courses"][0]["id"], ingestion_result

    course_id = _choose_existing_course(headers)
    return course_id, ingestion_result


def build_structure(headers: dict[str, str], course_id: int) -> None:
    section("BUILD STRUCTURE")
    payload = post(f"/course-structures/{course_id}/build", headers=headers, timeout=180)
    assert payload["build_status"] == "built"


def add_queue_item(headers: dict[str, str], course_id: int) -> int:
    response = requests.post(
        f"{BASE_URL}/plans/queue/{course_id}",
        headers=headers,
        json={"note": "Assistant stage3 queue item."},
        timeout=60,
    )
    payload = assert_status(response, 201)
    assert isinstance(payload, dict)
    return payload["id"]


def read_plan(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}",
        headers=headers,
        timeout=60,
    )
    payload = assert_status(response, 200)
    assert isinstance(payload, dict)
    return payload


def create_plan(headers: dict[str, str], queue_item_id: int) -> int:
    section("CREATE PLAN")
    response = requests.post(
        f"{BASE_URL}/plans",
        headers=headers,
        json={
            "title": "Assistant Stage3 Plan",
            "goal": "job",
            "queue_item_ids": [queue_item_id],
            "preferred_time_window": "evening",
            "pace_mode": "balanced",
            "preferred_study_days": ["sunday", "monday", "wednesday", "thursday"],
            "max_daily_minutes": 90,
            "session_cap_minutes": 30,
            "temporary_note": "Stage3 assistant verification plan.",
        },
        timeout=60,
    )
    payload = assert_status(response, 201)
    assert isinstance(payload, dict)
    return payload["id"]


def generate_schedule(headers: dict[str, str], plan_id: int) -> list[dict[str, Any]]:
    section("GENERATE SCHEDULE")
    plan = read_plan(headers, plan_id)
    schedule = post(
        f"/plans/{plan_id}/schedule/generate",
        payload={"force_rebuild": False, "expected_version": plan["version"]},
        headers=headers,
        timeout=180,
    )
    assert schedule["items"], "Expected generated schedule items."
    return schedule["items"]


def start_complete_skip_and_make_overdue(
    headers: dict[str, str],
    plan_id: int,
    items: list[dict[str, Any]],
) -> None:
    section("CREATE EXECUTION AND RECOVERY STATE")

    assert len(items) >= 3, "Expected at least three schedule items."

    start_response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{items[0]['id']}/start",
        headers=with_expected_version(headers, items[0]["version"]),
        timeout=60,
    )
    start_result = assert_status(start_response, 200)
    assert isinstance(start_result, dict)
    assert start_result["item"]["status"] == "in_progress"

    complete_response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{items[0]['id']}/complete",
        headers=headers,
        json={
            "actual_minutes": max(items[0]["planned_minutes"], 20),
            "expected_version": start_result["item"]["version"],
        },
        timeout=60,
    )
    complete_result = assert_status(complete_response, 200)
    assert isinstance(complete_result, dict)
    assert complete_result["item"]["status"] == "completed"

    skip_response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{items[1]['id']}/skip",
        headers=headers,
        json={
            "skip_reason": "Assistant stage3 recovery setup.",
            "expected_version": items[1]["version"],
        },
        timeout=60,
    )
    skip_result = assert_status(skip_response, 200)
    assert isinstance(skip_result, dict)
    assert skip_result["item"]["status"] == "skipped"

    db = new_session()
    try:
        overdue_item = db.query(LearningPlanItem).filter(LearningPlanItem.id == items[2]["id"]).first()
        assert overdue_item is not None, "Expected schedule item for overdue setup."
        overdue_item.scheduled_date = get_local_date("Asia/Riyadh") - timedelta(days=2)
        db.commit()
    finally:
        db.close()


def create_conversation(headers: dict[str, str]) -> int:
    response = requests.post(
        f"{BASE_URL}/assistant/conversations",
        headers=headers,
        json={"title": "Assistant stage3 orchestration verification"},
        timeout=60,
    )
    payload = assert_status(response, 201)
    assert isinstance(payload, dict)
    return payload["id"]


def send_assistant_message(headers: dict[str, str], conversation_id: int, content: str) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/assistant/conversations/{conversation_id}/messages",
        headers=headers,
        json={"content": content},
        timeout=120,
    )
    payload = assert_status(response, 200)
    assert isinstance(payload, dict)
    return payload


def confirm_memory_signal(headers: dict[str, str], signal_id: int) -> dict[str, Any]:
    return post(f"/assistant/memory-signals/{signal_id}/confirm", headers=headers)


def confirm_action(headers: dict[str, str], action_run_id: int) -> dict[str, Any]:
    return post(f"/assistant/action-runs/{action_run_id}/confirm", headers=headers)


def main() -> None:
    section("CHECK SERVER")
    root = get("/")
    assert isinstance(root, dict)
    assert root["message"] == "SOLA backend is running"

    headers, _user_id = register_and_login()
    create_profile(headers)

    course_id, ingestion_result = ingest_and_choose_course(headers)
    build_structure(headers, course_id)

    queue_item_id = add_queue_item(headers, course_id)
    plan_id = create_plan(headers, queue_item_id)

    schedule_items = generate_schedule(headers, plan_id)
    start_complete_skip_and_make_overdue(headers, plan_id, schedule_items)

    section("CREATE ASSISTANT CONVERSATION")
    conversation_id = create_conversation(headers)

    section("SEND SCHEDULE MESSAGE AND EXTRACT MEMORY")
    schedule_exchange = send_assistant_message(
        headers,
        conversation_id,
        "My schedule is not suitable because I work at night this week and I need help.",
    )
    assert schedule_exchange["response_mode"] == "grounded_schedule_guidance"
    assert schedule_exchange["memory_candidates"], "Expected memory candidates from schedule message."

    signal = next(
        signal
        for signal in schedule_exchange["memory_candidates"]
        if signal["signal_key"] == "temporarily_unavailable_time_window"
    )
    confirmed_signal = confirm_memory_signal(headers, signal["id"])
    assert confirmed_signal["status"] == "active"

    section("SEND COURSE COMPARISON MESSAGE")
    comparison_exchange = send_assistant_message(
        headers,
        conversation_id,
        "Compare the best two course options for me and tell me which one is stronger now.",
    )
    assert comparison_exchange["response_mode"] == "grounded_course_comparison"
    queue_action = next(
        action
        for action in comparison_exchange["suggested_actions"]
        if action["action_type"] == "queue_top_recommendation"
    )
    queue_result = confirm_action(headers, queue_action["action_run_id"])
    assert queue_result["status"] == "executed"
    assert queue_result["result_payload"]["queue_item_id"]

    section("SEND SCHEDULE FOLLOW-UP WITH REMEMBERED SIGNAL")
    remembered_exchange = send_assistant_message(
        headers,
        conversation_id,
        "My schedule still feels wrong for night work. What do you suggest now?",
    )
    assert remembered_exchange["response_mode"] == "grounded_schedule_guidance"
    remembered_summary = remembered_exchange["used_context_summary"]["remembered_schedule_signals"]
    assert remembered_summary["temporary_unavailable_time_window"] == "night"

    section("READ ACTION RUNS")
    action_runs = get("/assistant/action-runs", headers=headers)
    assert isinstance(action_runs, list)
    assert action_runs, "Expected assistant action runs."

    section("READ MEMORY SIGNALS")
    memory_signals = get("/assistant/memory-signals", headers=headers)
    assert isinstance(memory_signals, list)
    assert memory_signals, "Expected assistant memory signals."

    section("ASSISTANT BLOCK 9 STAGE 3 ORCHESTRATION PASSED")
    pprint(
        {
            "conversation_id": conversation_id,
            "plan_id": plan_id,
            "optional_ingestion": ingestion_result,
            "confirmed_signal": {
                "signal_id": confirmed_signal["id"],
                "signal_key": confirmed_signal["signal_key"],
                "status": confirmed_signal["status"],
            },
            "comparison_response_mode": comparison_exchange["response_mode"],
            "queued_action_result": queue_result["result_payload"],
            "remembered_schedule_signals": remembered_summary,
            "action_run_count": len(action_runs),
            "memory_signal_count": len(memory_signals),
        }
    )


if __name__ == "__main__":
    main()