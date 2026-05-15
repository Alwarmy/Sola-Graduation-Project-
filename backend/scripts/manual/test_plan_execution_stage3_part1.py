import json
from datetime import timedelta
from typing import Any

import requests

from app.core.timezone_utils import get_local_date
from app.db.session import new_session
from app.models.learning_plan_item import LearningPlanItem


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
    assert len(courses) >= 1, "Need at least one playlist course for execution test."
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
            "temporary_note": "Execution state test plan.",
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


def read_plan_readiness(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/readiness",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def read_execution_summary(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/execution-summary",
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


def update_plan_status(headers: dict[str, str], plan_id: int, status_value: str) -> dict[str, Any]:
    response = requests.put(
        f"{BASE_URL}/plans/{plan_id}/status",
        headers=headers,
        json={"status": status_value},
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def set_item_scheduled_date(plan_item_id: int, scheduled_date) -> None:
    db = new_session()
    try:
        item = db.query(LearningPlanItem).filter(LearningPlanItem.id == plan_item_id).first()
        assert item is not None, f"Learning plan item {plan_item_id} was not found."

        item.scheduled_date = scheduled_date
        db.commit()
    finally:
        db.close()


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    archive_open_plans(headers)

    courses = get_playlist_candidate_courses()
    queue_item = ensure_queue_item(
        headers=headers,
        course_id=courses[0]["id"],
        note="Execution stage 3 part 1 candidate.",
    )

    plan = create_plan(
        headers=headers,
        queue_item_ids=[queue_item["id"]],
        title="Plan Execution Stage 3 Part 1",
    )
    plan_id = plan["id"]

    generate_schedule(headers, plan_id)

    items = read_plan_items(headers, plan_id)
    assert len(items) >= 3, "Execution test requires at least 3 generated plan items."

    readiness = read_plan_readiness(headers, plan_id)
    timezone_snapshot = readiness["schedule_timezone_snapshot"]

    print_step("START FIRST ITEM")
    start_item(headers, plan_id, items[0]["id"])

    print_step("COMPLETE FIRST ITEM")
    complete_item(headers, plan_id, items[0]["id"], actual_minutes=items[0]["planned_minutes"])

    print_step("SKIP SECOND ITEM")
    skip_item(headers, plan_id, items[1]["id"], skip_reason="Execution test skip.")

    print_step("MARK THIRD ITEM AS OVERDUE IN DATABASE")
    overdue_date = get_local_date(timezone_snapshot) - timedelta(days=1)
    set_item_scheduled_date(items[2]["id"], overdue_date)

    overdue_summary = read_execution_summary(headers, plan_id)
    assert overdue_summary["overdue_items_count"] >= 1, "Expected at least one overdue item."

    print_step("PAUSE PLAN AND ASSERT EXECUTION BLOCKED")
    update_plan_status(headers, plan_id, "paused")
    paused_start_response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{items[2]['id']}/start",
        headers=headers,
        timeout=30,
    )
    assert paused_start_response.status_code == 409, (
        f"Expected 409 while starting item on paused plan, got {paused_start_response.status_code}: {paused_start_response.text}"
    )

    print_step("REACTIVATE AND COMPLETE OVERDUE ITEM")
    update_plan_status(headers, plan_id, "active")
    start_item(headers, plan_id, items[2]["id"])
    complete_item(headers, plan_id, items[2]["id"], actual_minutes=items[2]["planned_minutes"])

    final_summary = read_execution_summary(headers, plan_id)
    assert final_summary["completed_items_count"] >= 2
    assert final_summary["skipped_items_count"] >= 1

    print_step("EXECUTION STAGE 3 PART 1 TEST PASSED")
    print(
        json.dumps(
            {
                "plan_id": plan_id,
                "plan_timezone_snapshot": timezone_snapshot,
                "final_execution_summary": final_summary,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()