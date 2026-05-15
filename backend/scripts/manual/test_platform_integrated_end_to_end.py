from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from app.core.timezone_utils import get_local_date
from app.db.session import new_session
from app.models.learning_plan_item import LearningPlanItem

BASE_URL = os.getenv("SOLA_BASE_URL", "http://127.0.0.1:8000")
TEST_PASSWORD = "12345678"
EXPECTED_VERSION_HEADER = "X-Expected-Version"


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> None:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )


def build_test_identity() -> tuple[str, str]:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    email = f"sola.e2e.{timestamp}@example.com"
    full_name = f"SOLA E2E {timestamp}"
    return email, full_name


def register_user(email: str, full_name: str) -> None:
    print_step("REGISTER USER")

    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "full_name": full_name,
            "password": TEST_PASSWORD,
        },
        timeout=30,
    )
    assert_status(response, 201)


def login_and_get_token(email: str) -> str:
    print_step("LOGIN")

    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "email": email,
            "password": TEST_PASSWORD,
        },
        timeout=30,
    )
    assert_status(response, 200)

    token = response.json().get("access_token")
    assert token, "No access_token returned from /auth/login"
    print("Login successful.")
    return token


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def with_expected_version(headers: dict[str, str], version: int) -> dict[str, str]:
    merged = dict(headers)
    merged[EXPECTED_VERSION_HEADER] = str(version)
    return merged


def read_current_user(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=30)
    assert_status(response, 200)
    return response.json()


def create_profile(headers: dict[str, str]) -> dict[str, Any]:
    print_step("CREATE PROFILE")

    response = requests.post(
        f"{BASE_URL}/profile",
        headers=headers,
        json={
            "background_track": "data_science",
            "primary_track": "data_science",
            "secondary_tracks": ["ai_ml"],
            "target_role": "Machine Learning Engineer",
            "experience_level": "beginner",
            "employment_status": "job_seeker",
            "is_student": True,
            "education_major": "Software Engineering",
            "weekly_hours": 8,
            "goal": "job",
            "preferred_language": "en",
            "bio": "I want a structured path in Python, machine learning, and deep learning.",
            "timezone": "Asia/Riyadh",
        },
        timeout=30,
    )
    assert_status(response, 201)

    profile = response.json()
    assert profile["primary_track"] == "data_science"
    assert profile["timezone"] == "Asia/Riyadh"
    return profile


def try_optional_ingestion(headers: dict[str, str]) -> dict[str, Any]:
    print_step("INGEST COURSES")

    response = requests.post(
        f"{BASE_URL}/courses/ingest",
        headers=headers,
        json={
            "query": "python machine learning deep learning",
            "max_results_per_type": 12,
        },
        timeout=180,
    )

    if response.status_code == 201:
        payload = response.json()
        assert payload["total_promoted_courses"] > 0, "Expected promoted courses from ingestion."
        assert payload["courses"], "Expected course cards from ingestion response."
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

    assert_status(response, 201)
    payload = response.json()
    return {
        "attempted": True,
        "succeeded": True,
        "skipped_due_to_provider": False,
        "payload": payload,
    }


def list_courses(
    headers: dict[str, str],
    *,
    query: str,
    sort_by: str,
    language: str = "en",
    limit: int = 10,
) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/courses",
        headers=headers,
        params={
            "q": query,
            "sort_by": sort_by,
            "language": language,
            "limit": limit,
            "offset": 0,
        },
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def read_search_results(headers: dict[str, str]) -> dict[str, Any]:
    print_step("SEARCH PERSONALIZED CATALOG")

    response = requests.get(
        f"{BASE_URL}/courses/search",
        headers=headers,
        params={
            "q": "machine learning python beginner",
            "sort_by": "personalized",
            "language": "en",
            "limit": 6,
            "offset": 0,
        },
        timeout=60,
    )
    assert_status(response, 200)

    payload = response.json()
    metadata = payload["metadata"]

    assert metadata["ranking_mode"] == "search_personalized"
    assert metadata["personalization_enabled"] is True
    assert metadata["personalized_result_count"] > 0
    assert metadata["explanation_result_count"] > 0
    assert payload["items"], "Expected search items."

    first_item = payload["items"][0]
    assert first_item["personalization"] is not None
    assert first_item["discovery"] is not None
    return payload


def read_recommendations(headers: dict[str, str]) -> dict[str, Any]:
    print_step("READ RECOMMENDATIONS")

    response = requests.get(
        f"{BASE_URL}/recommendations",
        headers=headers,
        params={"limit": 5},
        timeout=60,
    )
    assert_status(response, 200)

    payload = response.json()
    assert payload["total"] > 0, "Expected personalized recommendations."
    assert payload["items"], "Expected recommendation items."

    first_item = payload["items"][0]
    assert first_item["personalization"] is not None
    return payload


def build_course_structure_for_course(headers: dict[str, str], course_id: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    print_step("BUILD COURSE STRUCTURE")

    build_response = requests.post(
        f"{BASE_URL}/course-structures/{course_id}/build",
        headers=headers,
        timeout=180,
    )
    assert_status(build_response, 200)
    structure = build_response.json()

    assert structure["build_status"] == "built"
    assert structure["total_units"] > 0
    assert structure["total_minutes"] > 0

    units_response = requests.get(
        f"{BASE_URL}/course-structures/{course_id}/units",
        headers=headers,
        timeout=60,
    )
    assert_status(units_response, 200)
    units = units_response.json()

    assert len(units) == structure["total_units"]
    return structure, units


def add_course_to_queue(headers: dict[str, str], course_id: int, note: str) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/queue/{course_id}",
        headers=headers,
        json={"note": note},
        timeout=60,
    )
    assert_status(response, 201)
    return response.json()


def create_plan(headers: dict[str, str], queue_item_ids: list[int]) -> dict[str, Any]:
    print_step("CREATE LEARNING PLAN")

    response = requests.post(
        f"{BASE_URL}/plans",
        headers=headers,
        json={
            "title": "Integrated Platform Verification Plan",
            "goal": "job",
            "queue_item_ids": queue_item_ids,
            "preferred_time_window": "evening",
            "pace_mode": "balanced",
            "preferred_study_days": ["sunday", "monday", "wednesday", "thursday"],
            "max_daily_minutes": 90,
            "session_cap_minutes": 30,
            "temporary_note": "Integrated end-to-end verification plan.",
        },
        timeout=60,
    )
    assert_status(response, 201)

    plan = response.json()
    assert plan["status"] == "active"
    assert plan["schedule_timezone_snapshot"] == "Asia/Riyadh"
    assert len(plan["courses"]) == len(queue_item_ids)
    return plan


def read_plan(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}",
        headers=headers,
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def read_plan_readiness(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/readiness",
        headers=headers,
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def generate_schedule(headers: dict[str, str], plan: dict[str, Any], *, force_rebuild: bool = False) -> dict[str, Any]:
    print_step("GENERATE SCHEDULE")

    payload: dict[str, Any] = {
        "force_rebuild": force_rebuild,
        "expected_version": plan["version"],
    }
    if force_rebuild:
        payload["expected_schedule_revision"] = plan["schedule_revision"]

    response = requests.post(
        f"{BASE_URL}/plans/{plan['id']}/schedule/generate",
        headers=headers,
        json=payload,
        timeout=180,
    )
    assert_status(response, 200)

    schedule = response.json()
    assert schedule["total_items"] > 0
    assert schedule["total_minutes"] > 0
    assert schedule["items"], "Expected schedule items."
    return schedule


def read_plan_items(headers: dict[str, str], plan_id: int, *, actionable_only: bool = False) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/items",
        headers=headers,
        params={"actionable_only": str(actionable_only).lower()},
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def start_plan_item(headers: dict[str, str], plan_id: int, item: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item['id']}/start",
        headers=with_expected_version(headers, item["version"]),
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def complete_plan_item(headers: dict[str, str], plan_id: int, item: dict[str, Any], actual_minutes: int) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item['id']}/complete",
        headers=headers,
        json={
            "actual_minutes": actual_minutes,
            "expected_version": item["version"],
        },
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def skip_plan_item(headers: dict[str, str], plan_id: int, item: dict[str, Any], skip_reason: str) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item['id']}/skip",
        headers=headers,
        json={
            "skip_reason": skip_reason,
            "expected_version": item["version"],
        },
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def read_execution_summary(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/execution-summary",
        headers=headers,
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def set_item_as_overdue(plan_item_id: int) -> None:
    db = new_session()
    try:
        item = db.query(LearningPlanItem).filter(LearningPlanItem.id == plan_item_id).first()
        assert item is not None, f"Learning plan item {plan_item_id} was not found."

        overdue_date = get_local_date("Asia/Riyadh") - timedelta(days=2)
        item.scheduled_date = overdue_date
        db.commit()
    finally:
        db.close()


def read_recovery_preview(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/recovery-preview",
        headers=headers,
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def apply_recovery(headers: dict[str, str], plan: dict[str, Any], recovery_preview: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/plans/{plan['id']}/recover",
        headers=headers,
        json={
            "mode": "rebalance",
            "expected_version": plan["version"],
            "expected_schedule_revision": recovery_preview["schedule_revision"],
            "recovery_note": "Integrated end-to-end recovery validation.",
        },
        timeout=180,
    )
    assert_status(response, 200)
    return response.json()


def read_events(headers: dict[str, str], event_type: str | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"limit": 100, "offset": 0}
    if event_type is not None:
        params["event_type"] = event_type

    response = requests.get(
        f"{BASE_URL}/events",
        headers=headers,
        params=params,
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def read_learning_state(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/learning-state",
        headers=headers,
        timeout=60,
    )
    assert_status(response, 200)
    return response.json()


def choose_plan_courses(
    search_payload: dict[str, Any],
    recommendation_payload: dict[str, Any],
    fallback_catalog: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    for item in search_payload["items"] + recommendation_payload["items"] + list(fallback_catalog or []):
        if item["id"] in seen_ids:
            continue
        if item["source"] != "youtube":
            continue

        selected.append(item)
        seen_ids.add(item["id"])

        if len(selected) == 2:
            break

    assert len(selected) == 2, "Expected at least two distinct YouTube courses for integrated testing."
    return selected


def main() -> None:
    print_step("CHECK SERVER")
    root_response = requests.get(f"{BASE_URL}/", timeout=10)
    assert_status(root_response, 200)

    email, full_name = build_test_identity()
    register_user(email, full_name)
    token = login_and_get_token(email)
    headers = auth_headers(token)

    user = read_current_user(headers)
    profile = create_profile(headers)
    ingestion_result = try_optional_ingestion(headers)
    search_payload = read_search_results(headers)
    recommendation_payload = read_recommendations(headers)
    fallback_catalog = list_courses(
        headers,
        query="python machine learning",
        sort_by="quality",
        language="en",
        limit=10,
    )

    selected_courses = choose_plan_courses(search_payload, recommendation_payload, fallback_catalog)
    structure, units = build_course_structure_for_course(headers, selected_courses[0]["id"])

    queue_items = [
        add_course_to_queue(headers, selected_courses[0]["id"], "Primary integrated test course."),
        add_course_to_queue(headers, selected_courses[1]["id"], "Secondary integrated test course."),
    ]
    plan = create_plan(headers, [item["id"] for item in queue_items])

    readiness_before = read_plan_readiness(headers, plan["id"])
    assert readiness_before["is_ready_for_schedule_generation"] is True
    assert readiness_before["has_schedule_items"] is False

    schedule = generate_schedule(headers, plan)
    plan = read_plan(headers, plan["id"])
    items = read_plan_items(headers, plan["id"])
    assert len(items) == schedule["total_items"]

    first_item = items[0]
    start_result = start_plan_item(headers, plan["id"], first_item)
    assert start_result["item"]["status"] == "in_progress"
    started_item = start_result["item"]

    complete_result = complete_plan_item(
        headers,
        plan["id"],
        started_item,
        actual_minutes=max(started_item["planned_minutes"], 1),
    )
    assert complete_result["item"]["status"] == "completed"

    refreshed_items = read_plan_items(headers, plan["id"])
    pending_items = [item for item in refreshed_items if item["status"] == "pending"]
    assert pending_items, "Expected pending items after completing the first schedule item."

    second_item = pending_items[0]
    skip_result = skip_plan_item(
        headers,
        plan["id"],
        second_item,
        skip_reason="Integrated test skip validation.",
    )
    assert skip_result["item"]["status"] == "skipped"

    items_after_skip = read_plan_items(headers, plan["id"])
    remaining_pending_items = [item for item in items_after_skip if item["status"] == "pending"]
    assert remaining_pending_items, "Expected at least one remaining pending item for recovery validation."

    overdue_target = remaining_pending_items[0]
    set_item_as_overdue(overdue_target["id"])

    execution_summary = read_execution_summary(headers, plan["id"])
    assert execution_summary["completed_items_count"] >= 1
    assert execution_summary["skipped_items_count"] >= 1

    recovery_preview = read_recovery_preview(headers, plan["id"])
    assert recovery_preview["needs_recovery"] is True
    assert recovery_preview["overdue_items_count"] >= 1
    assert recovery_preview["recommended_action"] in {"stay_on_track", "rebuild"}

    plan = read_plan(headers, plan["id"])
    recovery_result = apply_recovery(headers, plan, recovery_preview)
    assert recovery_result["schedule_revision"] == 2
    assert recovery_result["recovery_mode"] == "rebalance"

    events = read_events(headers)
    event_types = {event["event_type"] for event in events}
    for required_event in {
        "plan_item_started",
        "plan_item_completed",
        "plan_item_skipped",
    }:
        assert required_event in event_types, f"Missing execution event: {required_event}"

    learning_state = read_learning_state(headers)
    assert learning_state["engagement_score"] > 0
    assert learning_state["profile_alignment"]["primary_track"] == profile["primary_track"]

    print_step("INTEGRATED PLATFORM VERIFICATION PASSED")
    print(
        json.dumps(
            {
                "user_id": user["id"],
                "profile_id": profile["id"],
                "optional_ingestion": ingestion_result,
                "search_ranking_mode": search_payload["metadata"]["ranking_mode"],
                "recommendation_total": recommendation_payload["total"],
                "validated_structure": {
                    "course_id": selected_courses[0]["id"],
                    "structure_id": structure["id"],
                    "total_units": structure["total_units"],
                    "unit_count": len(units),
                },
                "plan_id": plan["id"],
                "schedule_total_items": schedule["total_items"],
                "execution_summary": execution_summary,
                "recovery": {
                    "schedule_revision": recovery_result["schedule_revision"],
                    "recovery_mode": recovery_result["recovery_mode"],
                },
                "learning_state": {
                    "current_focus": learning_state["current_focus"],
                    "engagement_score": learning_state["engagement_score"],
                    "dominant_interests": learning_state["dominant_interests"],
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()