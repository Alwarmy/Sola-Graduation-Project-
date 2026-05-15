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


def create_or_replace_profile(headers: dict[str, str], timezone_name: str) -> dict[str, Any]:
    payload = {
        "background_track": "software_engineering",
        "employment_status": "job_seeker",
        "is_student": True,
        "education_major": "Computer Science",
        "weekly_hours": 8,
        "goal": "job",
        "preferred_language": "any",
        "bio": "Stage 3 timezone snapshot verification.",
        "timezone": timezone_name,
    }

    create_response = requests.post(
        f"{BASE_URL}/profile",
        headers=headers,
        json=payload,
        timeout=30,
    )
    if create_response.status_code == 201:
        return create_response.json()

    update_response = requests.put(
        f"{BASE_URL}/profile",
        headers=headers,
        json=payload,
        timeout=30,
    )
    assert_status(update_response, 200)
    return update_response.json()


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


def get_candidate_courses() -> list[dict[str, Any]]:
    print_step("LOAD CANDIDATE COURSES")

    response = requests.get(
        f"{BASE_URL}/courses",
        params={"language": "en", "limit": 10, "offset": 0},
        timeout=30,
    )
    assert_status(response, 200)

    courses = response.json()
    assert len(courses) >= 2, "Need at least 2 courses for Stage 3 test."
    return courses[:2]


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
            "title": "Stage 3 Timezone Snapshot Plan",
            "goal": "job",
            "queue_item_ids": queue_item_ids,
            "preferred_time_window": "evening",
            "pace_mode": "balanced",
            "preferred_study_days": ["sunday", "monday", "wednesday", "thursday"],
            "max_daily_minutes": 180,
            "session_cap_minutes": 45,
            "temporary_note": "Timezone snapshot must remain stable.",
        },
        timeout=30,
    )
    assert_status(response, 201)
    return response.json()


def read_plan(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def read_readiness(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
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
        params={"force_rebuild": "true"},
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


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    archive_open_plans(headers)

    print_step("SET PROFILE TIMEZONE TO ASIA/TOKYO")
    profile = create_or_replace_profile(headers, "Asia/Tokyo")
    assert profile["timezone"] == "Asia/Tokyo"

    courses = get_candidate_courses()
    queue_item_ids = [
        ensure_queue_item(headers, courses[0]["id"], "Stage 3 queue item 1")["id"],
        ensure_queue_item(headers, courses[1]["id"], "Stage 3 queue item 2")["id"],
    ]

    plan = create_plan(headers, queue_item_ids)
    plan_id = plan["id"]
    assert plan["schedule_timezone_snapshot"] == "Asia/Tokyo"

    print_step("CHANGE PROFILE TIMEZONE TO AMERICA/NEW_YORK")
    updated_profile = create_or_replace_profile(headers, "America/New_York")
    assert updated_profile["timezone"] == "America/New_York"

    persisted_plan = read_plan(headers, plan_id)
    assert persisted_plan["schedule_timezone_snapshot"] == "Asia/Tokyo"

    readiness = read_readiness(headers, plan_id)
    assert readiness["schedule_timezone_snapshot"] == "Asia/Tokyo"

    schedule = generate_schedule(headers, plan_id)
    assert schedule["total_items"] > 0

    items = read_items(headers, plan_id)
    assert len(items) == schedule["total_items"]
    for item in items:
        assert item["item_metadata"]["schedule_timezone_snapshot"] == "Asia/Tokyo"

    print_step("PLAN TIMEZONE SNAPSHOT STAGE 3 TEST PASSED")
    print(
        json.dumps(
            {
                "plan_id": plan_id,
                "profile_timezone_now": updated_profile["timezone"],
                "plan_timezone_snapshot": persisted_plan["schedule_timezone_snapshot"],
                "generated_total_items": schedule["total_items"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()