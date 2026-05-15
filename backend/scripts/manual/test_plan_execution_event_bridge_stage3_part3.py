import json
from typing import Any

import requests

from app.db.session import new_session
from app.models.user_event import UserEvent


BASE_URL = "http://127.0.0.1:8000"
TEST_EMAIL = "test3@example.com"
TEST_PASSWORD = "123456"


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> None:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )


def login_and_get_token() -> str:
    print_step("LOGIN")

    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30,
    )
    assert_status(response, 200)
    print("Login successful.")
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def read_current_user(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/auth/me",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def archive_open_plans(headers: dict[str, str]) -> None:
    print_step("ARCHIVE OPEN PLANS IF ANY")

    response = requests.get(f"{BASE_URL}/plans", headers=headers, timeout=30)
    assert_status(response, 200)

    for plan in response.json():
        if plan["status"] in {"active", "paused"}:
            archive_response = requests.put(
                f"{BASE_URL}/plans/{plan['id']}/status",
                headers=headers,
                json={"status": "archived"},
                timeout=30,
            )
            assert_status(archive_response, 200)
            print(f"Archived open plan: {plan['id']}")


def get_playlist_candidate_courses() -> list[dict[str, Any]]:
    print_step("LOAD PLAYLIST CANDIDATE COURSES")

    response = requests.get(
        f"{BASE_URL}/courses",
        params={
            "source": "youtube",
            "content_type": "playlist",
            "language": "en",
            "limit": 10,
            "offset": 0,
        },
        timeout=30,
    )
    assert_status(response, 200)

    courses = response.json()
    assert len(courses) >= 1, "Need at least one playlist course for execution-event bridge test."
    return courses


def get_queue(headers: dict[str, str]) -> list[dict[str, Any]]:
    response = requests.get(f"{BASE_URL}/plans/queue", headers=headers, timeout=30)
    assert_status(response, 200)
    return response.json()


def ensure_queue_item(headers: dict[str, str], course_id: int, note: str) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/queue/{course_id}",
        headers=headers,
        json={"note": note},
        timeout=30,
    )

    if response.status_code == 201:
        return response.json()

    if response.status_code == 409:
        queue_items = get_queue(headers)
        for item in queue_items:
            if item["course_id"] == course_id:
                return item

    raise AssertionError(f"Unexpected queue add response: {response.status_code} - {response.text}")


def create_plan(headers: dict[str, str], queue_item_ids: list[int], title: str) -> dict[str, Any]:
    print_step("CREATE PLAN")

    response = requests.post(
        f"{BASE_URL}/plans",
        headers=headers,
        json={
            "title": title,
            "goal": "job",
            "queue_item_ids": queue_item_ids,
            "preferred_time_window": "evening",
            "pace_mode": "balanced",
            "preferred_study_days": ["sunday", "monday", "wednesday", "thursday"],
            "temporary_note": "Execution-event bridge validation plan.",
        },
        timeout=30,
    )
    assert_status(response, 201)
    return response.json()


def generate_schedule(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/schedule/generate",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def read_plan_items(headers: dict[str, str], plan_id: int) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/items",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def start_item(headers: dict[str, str], plan_id: int, item_id: int) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item_id}/start",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def complete_item(
    headers: dict[str, str],
    plan_id: int,
    item_id: int,
    actual_minutes: int,
) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item_id}/complete",
        headers=headers,
        json={"actual_minutes": actual_minutes},
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def skip_item(
    headers: dict[str, str],
    plan_id: int,
    item_id: int,
    skip_reason: str,
) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item_id}/skip",
        headers=headers,
        json={"skip_reason": skip_reason},
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def get_recent_execution_events(user_id: int, plan_id: int) -> list[UserEvent]:
    db = new_session()
    try:
        events = (
            db.query(UserEvent)
            .filter(UserEvent.user_id == user_id)
            .order_by(UserEvent.id.desc())
            .limit(30)
            .all()
        )

        execution_events = [
            event
            for event in events
            if event.event_type in {
                "plan_item_started",
                "plan_item_completed",
                "plan_item_skipped",
            }
            and (event.event_payload or {}).get("plan_id") == plan_id
        ]

        return list(reversed(execution_events))
    finally:
        db.close()


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)
    current_user = read_current_user(headers)
    user_id = current_user["id"]

    archive_open_plans(headers)

    courses = get_playlist_candidate_courses()
    queue_item = ensure_queue_item(
        headers=headers,
        course_id=courses[0]["id"],
        note="Execution-event bridge candidate.",
    )

    plan = create_plan(
        headers=headers,
        queue_item_ids=[queue_item["id"]],
        title="Execution Event Bridge Stage 3 Part 3",
    )
    plan_id = plan["id"]

    generate_schedule(headers, plan_id)

    items = read_plan_items(headers, plan_id)
    assert len(items) >= 2, "Execution-event bridge test requires at least 2 plan items."

    first_item = items[0]
    second_item = items[1]

    print_step("START FIRST ITEM")
    start_item(headers, plan_id, first_item["id"])

    print_step("COMPLETE FIRST ITEM")
    complete_item(headers, plan_id, first_item["id"], actual_minutes=first_item["planned_minutes"])

    print_step("SKIP SECOND ITEM")
    skip_item(headers, plan_id, second_item["id"], skip_reason="Execution-event bridge test skip.")

    print_step("LOAD RECENT EXECUTION EVENTS")
    events = get_recent_execution_events(user_id=user_id, plan_id=plan_id)

    assert len(events) >= 3, "Expected at least 3 execution events for the plan."

    started_event = next((event for event in events if event.event_type == "plan_item_started"), None)
    completed_event = next((event for event in events if event.event_type == "plan_item_completed"), None)
    skipped_event = next((event for event in events if event.event_type == "plan_item_skipped"), None)

    assert started_event is not None, "Missing plan_item_started event."
    assert completed_event is not None, "Missing plan_item_completed event."
    assert skipped_event is not None, "Missing plan_item_skipped event."

    assert started_event.event_payload["plan_id"] == plan_id
    assert started_event.event_payload["plan_item_id"] == first_item["id"]
    assert started_event.event_payload["item_status"] == "in_progress"

    assert completed_event.event_payload["plan_id"] == plan_id
    assert completed_event.event_payload["plan_item_id"] == first_item["id"]
    assert completed_event.event_payload["item_status"] == "completed"

    assert skipped_event.event_payload["plan_id"] == plan_id
    assert skipped_event.event_payload["plan_item_id"] == second_item["id"]
    assert skipped_event.event_payload["item_status"] == "skipped"
    assert skipped_event.event_payload["skip_reason"] == "Execution-event bridge test skip."

    print_step("PLAN EXECUTION EVENT BRIDGE STAGE 3 PART 3 PASSED")
    print(
        json.dumps(
            {
                "plan_id": plan_id,
                "user_id": user_id,
                "events": [
                    {
                        "id": event.id,
                        "event_type": event.event_type,
                        "event_payload": event.event_payload,
                        "created_at": event.created_at.isoformat() if event.created_at else None,
                    }
                    for event in events
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()