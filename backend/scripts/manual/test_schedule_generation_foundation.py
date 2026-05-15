import json
from collections import defaultdict
from datetime import date
from typing import Any

import requests


BASE_URL = "http://127.0.0.1:8000"
TEST_EMAIL = "test3@example.com"
TEST_PASSWORD = "123456"

PREFERRED_STUDY_DAYS = ["sunday", "monday", "wednesday", "thursday"]
MAX_DAILY_MINUTES = 180
SESSION_CAP_MINUTES = 45


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
        params={"language": "en", "limit": 20, "offset": 0},
        timeout=30,
    )
    assert_status(response, 200)

    courses = response.json()
    assert len(courses) >= 3, "Need at least 3 courses for schedule generation test."
    return courses[:3]


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


def create_plan(headers: dict[str, str], queue_item_ids: list[int]) -> dict[str, Any]:
    print_step("CREATE PLAN")

    response = requests.post(
        f"{BASE_URL}/plans",
        headers=headers,
        json={
            "title": "Schedule Generation Foundation Plan",
            "goal": "job",
            "queue_item_ids": queue_item_ids,
            "preferred_time_window": "evening",
            "pace_mode": "balanced",
            "preferred_study_days": PREFERRED_STUDY_DAYS,
            "max_daily_minutes": MAX_DAILY_MINUTES,
            "session_cap_minutes": SESSION_CAP_MINUTES,
            "temporary_note": "Build me a realistic initial schedule.",
        },
        timeout=30,
    )
    assert_status(response, 201)
    return response.json()


def read_readiness(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/readiness",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def generate_schedule(headers: dict[str, str], plan_id: int, force_rebuild: bool) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/schedule/generate",
        headers=headers,
        params={"force_rebuild": str(force_rebuild).lower()},
        timeout=120,
    )
    assert_status(response, 200)
    return response.json()


def read_items(headers: dict[str, str], plan_id: int) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/items",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def assert_pre_generation_readiness(readiness: dict[str, Any]) -> None:
    print_step("ASSERT PRE-GENERATION READINESS")

    assert readiness["is_ready_for_schedule_generation"] is True
    assert readiness["is_ready_for_force_regeneration"] is False
    assert readiness["is_ready_for_execution"] is False
    assert readiness["has_schedule_items"] is False
    assert readiness["schedule_total_items"] == 0
    assert "schedule_not_generated" in readiness["execution_blockers"]

    print("Pre-generation readiness looks correct.")


def assert_post_generation_readiness(readiness: dict[str, Any], result: dict[str, Any]) -> None:
    print_step("ASSERT POST-GENERATION READINESS")

    assert readiness["has_schedule_items"] is True
    assert readiness["schedule_total_items"] == result["total_items"]
    assert readiness["schedule_total_minutes"] == result["total_minutes"]
    assert readiness["scheduled_start_date"] == result["scheduled_start_date"]
    assert readiness["scheduled_end_date"] == result["scheduled_end_date"]

    assert readiness["is_ready_for_schedule_generation"] is False
    assert readiness["is_ready_for_force_regeneration"] is True
    assert readiness["is_ready_for_execution"] is True
    assert "schedule_already_generated" in readiness["generation_blockers"]
    assert readiness["base_blockers"] == []

    print("Post-generation readiness looks correct.")


def assert_schedule_generation_result(result: dict[str, Any]) -> None:
    print_step("ASSERT GENERATED SCHEDULE SUMMARY")

    assert result["total_items"] > 0
    assert result["total_minutes"] > 0
    assert result["scheduled_start_date"] is not None
    assert result["scheduled_end_date"] is not None
    assert len(result["items"]) == result["total_items"]

    print("Generated schedule summary looks correct.")


def assert_schedule_items(items: list[dict[str, Any]]) -> None:
    print_step("ASSERT GENERATED SCHEDULE ITEMS")

    assert len(items) > 0, "Generated schedule should contain items."

    day_totals: dict[str, int] = defaultdict(int)
    distinct_courses = set()

    for index, item in enumerate(items, start=1):
        assert item["schedule_order_index"] == index
        assert item["planned_minutes"] <= SESSION_CAP_MINUTES
        assert item["planned_minutes"] > 0
        assert item["time_window"] == "evening"

        distinct_courses.add(item["course_id"])
        day_totals[item["scheduled_date"]] += item["planned_minutes"]

    for scheduled_date, total_minutes in day_totals.items():
        assert total_minutes <= MAX_DAILY_MINUTES, (
            f"Daily total exceeded cap for {scheduled_date}: {total_minutes}"
        )

    assert len(distinct_courses) >= 2, "Schedule should include more than one course."

    print("Generated schedule items satisfy foundational rules.")


def assert_schedule_respects_preferred_days(items: list[dict[str, Any]]) -> None:
    print_step("ASSERT SCHEDULE RESPECTS PREFERRED STUDY DAYS")

    allowed_days = set(PREFERRED_STUDY_DAYS)
    weekday_to_name = {
        0: "monday",
        1: "tuesday",
        2: "wednesday",
        3: "thursday",
        4: "friday",
        5: "saturday",
        6: "sunday",
    }

    for item in items:
        scheduled = date.fromisoformat(item["scheduled_date"])
        day_name = weekday_to_name[scheduled.weekday()]
        assert day_name in allowed_days, (
            f"Scheduled day {item['scheduled_date']} resolved to {day_name}, which is not allowed."
        )

    print("Preferred study day rule works.")


def assert_conflict_without_force_rebuild(headers: dict[str, str], plan_id: int) -> None:
    print_step("ASSERT REGENERATION CONFLICT WITHOUT FORCE")

    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/schedule/generate",
        headers=headers,
        params={"force_rebuild": "false"},
        timeout=120,
    )
    assert response.status_code == 409, (
        f"Expected 409 when regenerating without force, got {response.status_code}: {response.text}"
    )

    print("Rebuild conflict guardrail works.")


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    archive_open_plans(headers)

    courses = get_candidate_courses()

    queue_items = []
    for index, course in enumerate(courses, start=1):
        queue_items.append(
            ensure_queue_item(
                headers=headers,
                course_id=course["id"],
                note=f"Schedule generation test course {index}",
            )
        )

    unique_queue_item_ids = []
    seen = set()
    for item in queue_items:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique_queue_item_ids.append(item["id"])

    assert len(unique_queue_item_ids) >= 2, "Need at least 2 queue items."

    plan = create_plan(headers, unique_queue_item_ids[:3])
    plan_id = plan["id"]

    pre_generation_readiness = read_readiness(headers, plan_id)
    assert_pre_generation_readiness(pre_generation_readiness)

    result = generate_schedule(headers, plan_id, force_rebuild=True)
    assert_schedule_generation_result(result)

    items = read_items(headers, plan_id)
    assert_schedule_items(items)
    assert_schedule_respects_preferred_days(items)

    post_generation_readiness = read_readiness(headers, plan_id)
    assert_post_generation_readiness(post_generation_readiness, result)

    assert_conflict_without_force_rebuild(headers, plan_id)

    regenerated = generate_schedule(headers, plan_id, force_rebuild=True)
    assert regenerated["total_items"] == len(read_items(headers, plan_id))

    print_step("SCHEDULE GENERATION FOUNDATION TEST PASSED")
    print(
        json.dumps(
            {
                "plan_id": plan_id,
                "generated_total_items": regenerated["total_items"],
                "generated_total_minutes": regenerated["total_minutes"],
                "scheduled_start_date": regenerated["scheduled_start_date"],
                "scheduled_end_date": regenerated["scheduled_end_date"],
                "post_generation_readiness": read_readiness(headers, plan_id),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()