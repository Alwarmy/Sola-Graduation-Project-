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
    assert len(courses) >= 1, "Need at least one playlist course for recovery test."
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
            "temporary_note": "Recovery stage 3 part 2 test plan.",
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


def read_recovery_preview(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/recovery-preview",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def apply_recovery(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/recover",
        headers=headers,
        json={
            "mode": "rebalance",
            "recovery_note": "Recovery stage 3 part 2 automated test.",
        },
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
        note="Recovery stage 3 part 2 candidate.",
    )

    plan = create_plan(
        headers=headers,
        queue_item_ids=[queue_item["id"]],
        title="Plan Recovery Stage 3 Part 2",
    )
    plan_id = plan["id"]

    generate_schedule(headers, plan_id)

    items = read_plan_items(headers, plan_id)
    assert len(items) >= 6, "Recovery test requires at least 6 generated plan items."

    readiness_before = read_plan_readiness(headers, plan_id)
    timezone_snapshot = readiness_before["schedule_timezone_snapshot"]
    today_local = get_local_date(timezone_snapshot)

    print_step("CREATE EXECUTION HISTORY")
    start_item(headers, plan_id, items[0]["id"])
    complete_item(headers, plan_id, items[0]["id"], actual_minutes=items[0]["planned_minutes"])
    skip_item(headers, plan_id, items[1]["id"], skip_reason="Recovery test skip.")
    start_item(headers, plan_id, items[2]["id"])

    print_step("CREATE OVERDUE DRIFT")
    set_item_scheduled_date(items[3]["id"], today_local - timedelta(days=1))
    set_item_scheduled_date(items[4]["id"], today_local - timedelta(days=2))
    set_item_scheduled_date(items[5]["id"], today_local - timedelta(days=3))

    recovery_preview_before = read_recovery_preview(headers, plan_id)
    assert recovery_preview_before["overdue_items_count"] >= 1, "Expected overdue items before recovery."
    assert recovery_preview_before["needs_recovery"] is True, "Expected plan to need recovery."

    print_step("APPLY RECOVERY")
    apply_recovery(headers, plan_id)

    readiness_after = read_plan_readiness(headers, plan_id)
    execution_summary_after = read_execution_summary(headers, plan_id)

    assert readiness_after["schedule_revision"] >= 2, "Expected schedule revision to increment after recovery."
    assert execution_summary_after["overdue_items_count"] == 0, "Expected overdue items to be cleared after recovery."

    print_step("PLAN RECOVERY STAGE 3 PART 2 TEST PASSED")
    print(
        json.dumps(
            {
                "plan_id": plan_id,
                "schedule_revision_after_recovery": readiness_after["schedule_revision"],
                "recovery_preview_before": recovery_preview_before,
                "execution_summary_after": execution_summary_after,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()