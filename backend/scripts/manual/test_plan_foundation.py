import json
from typing import Any

import requests


BASE_URL = "http://127.0.0.1:8000"
TEST_EMAIL = "test3@example.com"
TEST_PASSWORD = "123456"


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> None:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, "
        f"got {response.status_code}: {response.text}"
    )


def login_and_get_token() -> str:
    print_step("LOGIN")

    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
        },
        timeout=30,
    )
    assert_status(response, 200)
    token = response.json()["access_token"]
    print("Login successful.")
    return token


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def archive_open_plans(headers: dict[str, str]) -> None:
    print_step("ARCHIVE OPEN PLANS IF ANY")

    response = requests.get(f"{BASE_URL}/plans", headers=headers, timeout=30)
    assert_status(response, 200)

    plans = response.json()
    for plan in plans:
        if plan["status"] in {"active", "paused"}:
            archive_response = requests.put(
                f"{BASE_URL}/plans/{plan['id']}/status",
                headers=headers,
                json={"status": "archived"},
                timeout=30,
            )
            assert_status(archive_response, 200)
            print(f"Archived open plan: {plan['id']}")


def get_candidate_courses() -> list[dict[str, Any]]:
    print_step("LOAD CANDIDATE COURSES")

    response = requests.get(
        f"{BASE_URL}/courses",
        params={"language": "en", "limit": 10, "offset": 0},
        timeout=30,
    )
    assert_status(response, 200)

    courses = response.json()
    assert len(courses) >= 4, "Need at least 4 courses to test planning foundation."
    print(f"Loaded {len(courses)} candidate courses.")
    return courses[:4]


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


def assert_duplicate_queue_protection(headers: dict[str, str], course_id: int) -> None:
    print_step("ASSERT DUPLICATE QUEUE PROTECTION")

    response = requests.post(
        f"{BASE_URL}/plans/queue/{course_id}",
        headers=headers,
        json={"note": "Duplicate should be rejected."},
        timeout=30,
    )
    assert response.status_code == 409, (
        f"Expected 409 for duplicate queue add, got {response.status_code}: {response.text}"
    )
    print("Duplicate queue guardrail works.")


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
            "temporary_note": "Testing plan foundation behavior.",
        },
        timeout=30,
    )
    assert_status(response, 201)
    plan = response.json()
    print(f"Created plan: {plan['id']}")
    return plan


def read_active_plan(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(f"{BASE_URL}/plans/active", headers=headers, timeout=30)
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


def generate_schedule(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/schedule/generate",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def list_plan_items(headers: dict[str, str], plan_id: int) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/items",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def skip_plan_item(
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


def update_preferences(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    print_step("UPDATE PREFERENCES")

    response = requests.put(
        f"{BASE_URL}/plans/{plan_id}/preferences",
        headers=headers,
        json={
            "preferred_time_window": "night",
            "pace_mode": "accelerated",
            "max_daily_minutes": 180,
            "session_cap_minutes": 45,
            "temporary_note": "This week I can study later at night.",
        },
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def assert_cannot_delete_scheduled_queue_item(headers: dict[str, str], queue_item_id: int) -> None:
    print_step("ASSERT SCHEDULED QUEUE ITEM CANNOT BE DELETED")

    response = requests.delete(
        f"{BASE_URL}/plans/queue/{queue_item_id}",
        headers=headers,
        timeout=30,
    )
    assert response.status_code == 409, (
        f"Expected 409 when deleting a scheduled queue item, got {response.status_code}: {response.text}"
    )
    print("Scheduled queue delete guardrail works.")


def try_add_fourth_course_to_plan(
    headers: dict[str, str],
    plan_id: int,
    queue_item_id: int,
) -> None:
    print_step("ASSERT MAX 3 ACTIVE COURSES")

    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/courses/queue-items/{queue_item_id}",
        headers=headers,
        timeout=30,
    )
    assert response.status_code == 400, (
        f"Expected 400 when adding a fourth course, got {response.status_code}: {response.text}"
    )
    print("Max active course guardrail works.")


def remove_course(headers: dict[str, str], plan_id: int, plan_course_id: int) -> dict[str, Any]:
    response = requests.delete(
        f"{BASE_URL}/plans/{plan_id}/courses/{plan_course_id}",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def assert_last_course_cannot_be_removed(headers: dict[str, str], plan_id: int, plan_course_id: int) -> None:
    print_step("ASSERT LAST COURSE CANNOT BE REMOVED")

    response = requests.delete(
        f"{BASE_URL}/plans/{plan_id}/courses/{plan_course_id}",
        headers=headers,
        timeout=30,
    )
    assert response.status_code == 409, (
        f"Expected 409 when removing the last course, got {response.status_code}: {response.text}"
    )
    print("Last course guardrail works.")


def pause_and_reactivate_plan(headers: dict[str, str], plan_id: int) -> None:
    print_step("PAUSE AND REACTIVATE PLAN")

    pause_response = requests.put(
        f"{BASE_URL}/plans/{plan_id}/status",
        headers=headers,
        json={"status": "paused"},
        timeout=30,
    )
    assert_status(pause_response, 200)

    activate_response = requests.put(
        f"{BASE_URL}/plans/{plan_id}/status",
        headers=headers,
        json={"status": "active"},
        timeout=30,
    )
    assert_status(activate_response, 200)

    print("Pause/reactivate lifecycle works.")


def assert_archived_plan_is_immutable(
    headers: dict[str, str],
    plan_id: int,
    queue_item_id: int,
    remaining_plan_course_id: int,
) -> None:
    print_step("ASSERT ARCHIVED PLAN IS IMMUTABLE")

    archive_response = requests.put(
        f"{BASE_URL}/plans/{plan_id}/status",
        headers=headers,
        json={"status": "archived"},
        timeout=30,
    )
    assert_status(archive_response, 200)

    preference_response = requests.put(
        f"{BASE_URL}/plans/{plan_id}/preferences",
        headers=headers,
        json={"preferred_time_window": "morning"},
        timeout=30,
    )
    assert preference_response.status_code == 400, (
        f"Expected 400 for archived preference update, got {preference_response.status_code}: {preference_response.text}"
    )

    add_course_response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/courses/queue-items/{queue_item_id}",
        headers=headers,
        timeout=30,
    )
    assert add_course_response.status_code == 400, (
        f"Expected 400 for archived add-course attempt, got {add_course_response.status_code}: {add_course_response.text}"
    )

    remove_course_response = requests.delete(
        f"{BASE_URL}/plans/{plan_id}/courses/{remaining_plan_course_id}",
        headers=headers,
        timeout=30,
    )
    assert remove_course_response.status_code == 400, (
        f"Expected 400 for archived remove-course attempt, got {remove_course_response.status_code}: {remove_course_response.text}"
    )

    reactivate_response = requests.put(
        f"{BASE_URL}/plans/{plan_id}/status",
        headers=headers,
        json={"status": "active"},
        timeout=30,
    )
    assert reactivate_response.status_code == 400, (
        f"Expected 400 for archived reactivation attempt, got {reactivate_response.status_code}: {reactivate_response.text}"
    )

    print("Archived terminal lifecycle guardrails work.")


def assert_completed_plan_is_terminal(headers: dict[str, str], queue_item_id: int) -> None:
    print_step("ASSERT COMPLETED PLAN IS TERMINAL")

    completed_plan = create_plan(headers, [queue_item_id], "Completed Plan Terminal Test")
    completed_plan_id = completed_plan["id"]

    generate_schedule(headers, completed_plan_id)

    items = list_plan_items(headers, completed_plan_id)
    assert len(items) > 0, "Completed-plan terminal test requires generated schedule items."

    for item in items:
        skip_plan_item(
            headers=headers,
            plan_id=completed_plan_id,
            item_id=item["id"],
            skip_reason="Terminal completion test cleanup.",
        )

    complete_response = requests.put(
        f"{BASE_URL}/plans/{completed_plan_id}/status",
        headers=headers,
        json={"status": "completed"},
        timeout=30,
    )
    assert_status(complete_response, 200)

    readiness = read_plan_readiness(headers, completed_plan_id)
    assert readiness["status"] == "completed"
    assert readiness["is_ready_for_schedule_generation"] is False
    assert "plan_not_active" in readiness["base_blockers"]

    reactivate_response = requests.put(
        f"{BASE_URL}/plans/{completed_plan_id}/status",
        headers=headers,
        json={"status": "active"},
        timeout=30,
    )
    assert reactivate_response.status_code == 400, (
        f"Expected 400 for completed reactivation attempt, got {reactivate_response.status_code}: {reactivate_response.text}"
    )

    print("Completed terminal lifecycle guardrails work.")


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    archive_open_plans(headers)

    courses = get_candidate_courses()

    queue_items = []
    for index, course in enumerate(courses, start=1):
        queue_item = ensure_queue_item(
            headers=headers,
            course_id=course["id"],
            note=f"Foundation test queue item {index}",
        )
        queue_items.append(queue_item)

    unique_queue_item_ids = []
    seen = set()
    for item in queue_items:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique_queue_item_ids.append(item["id"])

    assert len(unique_queue_item_ids) >= 4, "Need at least 4 queue items for the test."

    assert_duplicate_queue_protection(headers, courses[0]["id"])

    plan = create_plan(headers, unique_queue_item_ids[:3], "Planning Foundation Test Plan")
    plan_id = plan["id"]

    active_plan = read_active_plan(headers)
    assert active_plan["id"] == plan_id, "Active plan mismatch."
    assert len(active_plan["courses"]) == 3, "Active plan should contain 3 courses."

    readiness = read_plan_readiness(headers, plan_id)
    assert readiness["is_ready_for_schedule_generation"] is True
    assert readiness["active_course_count"] == 3
    assert readiness["has_preference"] is True
    assert readiness["has_courses"] is True

    preference = update_preferences(headers, plan_id)
    assert preference["preferred_time_window"] == "night"
    assert preference["pace_mode"] == "accelerated"

    assert_cannot_delete_scheduled_queue_item(headers, unique_queue_item_ids[0])

    try_add_fourth_course_to_plan(headers, plan_id, unique_queue_item_ids[3])

    active_plan = read_active_plan(headers)
    first_course_id = active_plan["courses"][0]["id"]
    second_course_id = active_plan["courses"][1]["id"]
    third_course_id = active_plan["courses"][2]["id"]

    active_plan = remove_course(headers, plan_id, first_course_id)
    assert len(active_plan["courses"]) == 2, "Plan should contain 2 courses after first removal."

    active_plan = remove_course(headers, plan_id, second_course_id)
    assert len(active_plan["courses"]) == 1, "Plan should contain 1 course after second removal."

    assert_last_course_cannot_be_removed(headers, plan_id, third_course_id)

    pause_and_reactivate_plan(headers, plan_id)

    assert_archived_plan_is_immutable(
        headers=headers,
        plan_id=plan_id,
        queue_item_id=unique_queue_item_ids[3],
        remaining_plan_course_id=third_course_id,
    )

    assert_completed_plan_is_terminal(headers, unique_queue_item_ids[3])

    print_step("PLAN FOUNDATION TEST PASSED")
    print(
        json.dumps(
            {
                "tested_plan_id": plan_id,
                "readiness_after_terminal_checks": read_plan_readiness(headers, plan_id),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()