from __future__ import annotations

import os
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import requests

from app.core.timezone_utils import get_local_date
from app.db.session import new_session
from app.models.learning_plan_item import LearningPlanItem

BASE_URL = os.getenv("SOLA_BASE_URL", "http://127.0.0.1:8000")
TEST_PASSWORD = "12345678"
EXPECTED_VERSION_HEADER = "X-Expected-Version"
REQUEST_TIMEOUT = 60
INGEST_TIMEOUT = 180
BUILD_TIMEOUT = 180
SCHEDULE_TIMEOUT = 180
RECOVERY_TIMEOUT = 180


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def response_text(response: requests.Response) -> str:
    try:
        return json.dumps(response.json(), ensure_ascii=False)
    except Exception:
        return response.text


def with_expected_version(headers: dict[str, str], version: int) -> dict[str, str]:
    merged = dict(headers)
    merged[EXPECTED_VERSION_HEADER] = str(version)
    return merged


def assert_status(response: requests.Response, expected_status: int) -> None:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response_text(response)}"
    )


def assert_error(
    response: requests.Response,
    expected_status: int,
    expected_error_code: str | list[str] | tuple[str, ...] | None = None,
) -> dict[str, Any]:
    assert response.status_code == expected_status, (
        f"Expected error status {expected_status}, got {response.status_code}: {response_text(response)}"
    )
    payload = response.json()
    assert "detail" in payload, f"Missing error detail payload: {payload}"
    if expected_error_code is not None:
        expected_codes = {expected_error_code} if isinstance(expected_error_code, str) else set(expected_error_code)
        assert payload.get("error_code") in expected_codes, (
            f"Expected error_code in {sorted(expected_codes)}, got payload={payload}"
        )
    return payload


def build_test_identity() -> tuple[str, str]:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    email = f"sola.full.regression.{timestamp}@example.com"
    full_name = f"SOLA Full Regression {timestamp}"
    return email, full_name


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register_user(email: str, full_name: str) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "full_name": full_name,
            "password": TEST_PASSWORD,
        },
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 201)
    return response.json()


def login(email: str, password: str = TEST_PASSWORD) -> requests.Response:
    return requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=REQUEST_TIMEOUT,
    )


def login_and_get_token(email: str) -> str:
    response = login(email)
    assert_status(response, 200)
    token = response.json().get("access_token")
    assert token, "No access_token returned from /auth/login"
    return token


def read_current_user(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=REQUEST_TIMEOUT)
    assert_status(response, 200)
    return response.json()


def build_profile_payload(*, timezone_name: str, experience_level: str = "beginner") -> dict[str, Any]:
    return {
        "background_track": "data_science",
        "primary_track": "data_science",
        "secondary_tracks": ["ai_ml", "software_engineering"],
        "target_role": "Machine Learning Engineer",
        "experience_level": experience_level,
        "employment_status": "job_seeker",
        "is_student": True,
        "education_major": "Software Engineering",
        "weekly_hours": 8,
        "goal": "job",
        "preferred_language": "en",
        "bio": "Full platform regression verification profile.",
        "timezone": timezone_name,
    }


def create_profile(headers: dict[str, str], *, timezone_name: str) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/profile",
        headers=headers,
        json=build_profile_payload(timezone_name=timezone_name),
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 201)
    return response.json()


def update_profile(
    headers: dict[str, str],
    *,
    timezone_name: str,
    experience_level: str = "beginner",
) -> dict[str, Any]:
    response = requests.put(
        f"{BASE_URL}/profile",
        headers=headers,
        json=build_profile_payload(
            timezone_name=timezone_name,
            experience_level=experience_level,
        ),
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def read_profile(headers: dict[str, str]) -> requests.Response:
    return requests.get(f"{BASE_URL}/profile", headers=headers, timeout=REQUEST_TIMEOUT)


def create_manual_event(
    headers: dict[str, str],
    event_type: str,
    event_payload: dict[str, Any],
) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/events",
        headers=headers,
        json={"event_type": event_type, "event_payload": event_payload},
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 201)
    return response.json()


def read_events(
    headers: dict[str, str],
    *,
    event_type: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"limit": limit, "offset": 0}
    if event_type is not None:
        params["event_type"] = event_type

    response = requests.get(
        f"{BASE_URL}/events",
        headers=headers,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def refresh_learning_state(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/learning-state/refresh",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def read_learning_state(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/learning-state",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def try_optional_ingestion(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/courses/ingest",
        headers=headers,
        json={
            "query": "python machine learning deep learning",
            "max_results_per_type": 12,
        },
        timeout=INGEST_TIMEOUT,
    )
    if response.status_code == 201:
        payload = response.json()
        return {
            "attempted": True,
            "succeeded": True,
            "skipped_due_to_provider": False,
            "payload": payload,
        }

    if response.status_code in {403, 429, 500, 502, 503, 504}:
        return {
            "attempted": True,
            "succeeded": False,
            "skipped_due_to_provider": True,
            "payload": {
                "status_code": response.status_code,
                "response_text": response_text(response),
            },
        }

    assert_status(response, 201)
    return {
        "attempted": True,
        "succeeded": True,
        "skipped_due_to_provider": False,
        "payload": response.json(),
    }


def list_ingestions(headers: dict[str, str]) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/courses/ingestions",
        headers=headers,
        params={"limit": 10, "offset": 0},
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def list_raw_courses(headers: dict[str, str], ingestion_id: int) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/courses/raw",
        headers=headers,
        params={"ingestion_id": ingestion_id, "limit": 20, "offset": 0},
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def search_courses(
    headers: dict[str, str] | None,
    *,
    query: str,
    sort_by: str,
    language: str = "en",
    limit: int = 6,
) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/courses/search",
        headers=headers,
        params={
            "q": query,
            "sort_by": sort_by,
            "language": language,
            "limit": limit,
            "offset": 0,
        },
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def list_courses(
    headers: dict[str, str] | None,
    *,
    query: str,
    sort_by: str,
    language: str = "en",
    limit: int = 6,
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
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def get_course(headers: dict[str, str] | None, course_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/courses/{course_id}",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def read_recommendations(headers: dict[str, str], limit: int = 5) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/recommendations",
        headers=headers,
        params={"limit": limit},
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def build_course_structure(headers: dict[str, str], course_id: int) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/course-structures/{course_id}/build",
        headers=headers,
        timeout=BUILD_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def get_course_structure(headers: dict[str, str], course_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/course-structures/{course_id}",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def get_course_units(headers: dict[str, str], course_id: int) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/course-structures/{course_id}/units",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def add_course_to_queue(headers: dict[str, str], course_id: int, note: str) -> requests.Response:
    return requests.post(
        f"{BASE_URL}/plans/queue/{course_id}",
        headers=headers,
        json={"note": note},
        timeout=REQUEST_TIMEOUT,
    )


def read_queue(headers: dict[str, str]) -> list[dict[str, Any]]:
    response = requests.get(f"{BASE_URL}/plans/queue", headers=headers, timeout=REQUEST_TIMEOUT)
    assert_status(response, 200)
    return response.json()


def create_plan(headers: dict[str, str], queue_item_ids: list[int]) -> requests.Response:
    return requests.post(
        f"{BASE_URL}/plans",
        headers=headers,
        json={
            "title": "Full Platform System Regression Plan",
            "goal": "job",
            "queue_item_ids": queue_item_ids,
            "preferred_time_window": "evening",
            "pace_mode": "balanced",
            "preferred_study_days": ["sunday", "monday", "wednesday", "thursday"],
            "max_daily_minutes": 90,
            "session_cap_minutes": 30,
            "temporary_note": "Full system regression plan.",
        },
        timeout=REQUEST_TIMEOUT,
    )


def read_plan(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(f"{BASE_URL}/plans/{plan_id}", headers=headers, timeout=REQUEST_TIMEOUT)
    assert_status(response, 200)
    return response.json()


def read_plans(headers: dict[str, str]) -> list[dict[str, Any]]:
    response = requests.get(f"{BASE_URL}/plans", headers=headers, timeout=REQUEST_TIMEOUT)
    assert_status(response, 200)
    return response.json()


def read_active_plan(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(f"{BASE_URL}/plans/active", headers=headers, timeout=REQUEST_TIMEOUT)
    assert_status(response, 200)
    return response.json()


def read_plan_readiness(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/readiness",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def update_plan_preferences(headers: dict[str, str], plan: dict[str, Any]) -> dict[str, Any]:
    response = requests.put(
        f"{BASE_URL}/plans/{plan['id']}/preferences",
        headers=headers,
        json={
            "preferred_time_window": "night",
            "pace_mode": "balanced",
            "preferred_study_days": ["sunday", "tuesday", "thursday"],
            "max_daily_minutes": 80,
            "session_cap_minutes": 25,
            "temporary_note": "Preferences updated during full regression.",
            "expected_version": plan["version"],
        },
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def update_plan_status(headers: dict[str, str], plan: dict[str, Any], status_value: str) -> dict[str, Any]:
    response = requests.put(
        f"{BASE_URL}/plans/{plan['id']}/status",
        headers=headers,
        json={"status": status_value, "expected_version": plan["version"]},
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def generate_schedule(headers: dict[str, str], plan: dict[str, Any], *, force_rebuild: bool = False) -> requests.Response:
    payload: dict[str, Any] = {
        "force_rebuild": force_rebuild,
        "expected_version": plan["version"],
    }
    if force_rebuild:
        payload["expected_schedule_revision"] = plan["schedule_revision"]

    return requests.post(
        f"{BASE_URL}/plans/{plan['id']}/schedule/generate",
        headers=headers,
        json=payload,
        timeout=SCHEDULE_TIMEOUT,
    )


def read_plan_items(
    headers: dict[str, str],
    plan_id: int,
    *,
    actionable_only: bool = False,
    status_filter: str | None = None,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"actionable_only": str(actionable_only).lower()}
    if status_filter is not None:
        params["status_filter"] = status_filter

    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/items",
        headers=headers,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def start_plan_item(headers: dict[str, str], plan_id: int, item: dict[str, Any]) -> requests.Response:
    return requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item['id']}/start",
        headers=with_expected_version(headers, item["version"]),
        timeout=REQUEST_TIMEOUT,
    )


def complete_plan_item(
    headers: dict[str, str],
    plan_id: int,
    item: dict[str, Any],
    actual_minutes: int,
) -> requests.Response:
    return requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item['id']}/complete",
        headers=headers,
        json={"actual_minutes": actual_minutes, "expected_version": item["version"]},
        timeout=REQUEST_TIMEOUT,
    )


def skip_plan_item(
    headers: dict[str, str],
    plan_id: int,
    item: dict[str, Any],
    skip_reason: str,
) -> requests.Response:
    return requests.post(
        f"{BASE_URL}/plans/{plan_id}/items/{item['id']}/skip",
        headers=headers,
        json={"skip_reason": skip_reason, "expected_version": item["version"]},
        timeout=REQUEST_TIMEOUT,
    )


def read_execution_summary(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/execution-summary",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )
    assert_status(response, 200)
    return response.json()


def set_item_as_overdue(plan_item_id: int) -> None:
    db = new_session()
    try:
        item = db.query(LearningPlanItem).filter(LearningPlanItem.id == plan_item_id).first()
        assert item is not None, f"Learning plan item {plan_item_id} was not found."
        item.scheduled_date = get_local_date("Asia/Riyadh") - timedelta(days=2)
        db.commit()
    finally:
        db.close()


def read_recovery_preview(headers: dict[str, str], plan_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/plans/{plan_id}/recovery-preview",
        headers=headers,
        timeout=REQUEST_TIMEOUT,
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
            "recovery_note": "Full system regression recovery verification.",
        },
        timeout=RECOVERY_TIMEOUT,
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

    candidate_items: list[dict[str, Any]] = []
    candidate_items.extend(search_payload.get("items", []))
    candidate_items.extend(recommendation_payload.get("items", []))
    candidate_items.extend(list(fallback_catalog or []))

    def sort_key(item: dict[str, Any]) -> tuple[int, int, int]:
        is_playlist = 1 if item.get("content_type") == "playlist" else 0
        quality_score = int(item.get("quality_score") or 0)
        duration_total = int(item.get("duration_minutes_total") or 0)
        return (is_playlist, quality_score, duration_total)

    ordered_candidates = sorted(candidate_items, key=sort_key, reverse=True)

    for item in ordered_candidates:
        course_id = item.get("id")
        if not course_id or course_id in seen_ids:
            continue
        if item.get("source") != "youtube":
            continue
        selected.append(item)
        seen_ids.add(course_id)
        if len(selected) == 2:
            break

    assert len(selected) == 2, "Expected two distinct YouTube courses for full regression testing."
    return selected


def main() -> None:
    print_step("CHECK SERVER")
    root_response = requests.get(f"{BASE_URL}/", timeout=10)
    assert_status(root_response, 200)

    email, full_name = build_test_identity()

    print_step("REGISTER USER")
    user_registration = register_user(email, full_name)
    duplicate_registration = requests.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "full_name": full_name, "password": TEST_PASSWORD},
        timeout=REQUEST_TIMEOUT,
    )
    assert_error(duplicate_registration, 409, "user_already_exists")

    print_step("LOGIN GUARDRAILS")
    invalid_login = login(email, "wrong-password")
    assert_error(invalid_login, 401, "invalid_credentials")
    token = login_and_get_token(email)
    headers = auth_headers(token)

    print_step("AUTH ME")
    current_user = read_current_user(headers)
    assert current_user["email"] == email

    print_step("PROFILE GUARDRAILS AND CREATION")
    missing_profile_response = read_profile(headers)
    assert_error(missing_profile_response, 404, "not_found")

    profile = create_profile(headers, timezone_name="Asia/Riyadh")
    assert profile["timezone"] == "Asia/Riyadh"
    assert profile["primary_track"] == "data_science"

    duplicate_profile_response = requests.post(
        f"{BASE_URL}/profile",
        headers=headers,
        json=build_profile_payload(timezone_name="Asia/Riyadh"),
        timeout=REQUEST_TIMEOUT,
    )
    assert_error(duplicate_profile_response, 409, "conflict")

    invalid_timezone_response = requests.put(
        f"{BASE_URL}/profile",
        headers=headers,
        json=build_profile_payload(timezone_name="Mars/Olympus"),
        timeout=REQUEST_TIMEOUT,
    )
    assert_error(invalid_timezone_response, 400, "validation_error")

    print_step("EVENTS AND LEARNING STATE FOUNDATION")
    manual_event = create_manual_event(
        headers,
        "onboarding_completed",
        {"source": "full_system_regression"},
    )
    assert manual_event["event_type"] == "onboarding_completed"

    refreshed_learning_state = refresh_learning_state(headers)
    assert refreshed_learning_state["profile_alignment"]["primary_track"] == profile["primary_track"]

    print_step("COURSE INGESTION AND RAW PIPELINE")
    optional_ingestion = try_optional_ingestion(headers)
    raw_courses: list[dict[str, Any]] = []
    ingestions: list[dict[str, Any]] = []

    if optional_ingestion["succeeded"]:
        ingestion = optional_ingestion["payload"]
        assert ingestion["total_promoted_courses"] > 0
        assert ingestion["courses"], "Expected promoted course cards from ingestion."

        sample_ingested_course = ingestion["courses"][0]
        assert sample_ingested_course["card_summary"]
        assert isinstance(sample_ingested_course["badges"], list)
        assert isinstance(sample_ingested_course["topic_tags"], list)

        ingestions = list_ingestions(headers)
        assert any(item["id"] == ingestion["ingestion_id"] for item in ingestions)

        raw_courses = list_raw_courses(headers, ingestion["ingestion_id"])
        assert raw_courses, "Expected raw ingestion records for owned ingestion."
    else:
        ingestion = None

    print_step("SEARCH CONTRACTS AND CATALOG COMPATIBILITY")
    relevance_search = search_courses(
        headers,
        query="python beginner",
        sort_by="relevance",
        language="en",
    )
    assert relevance_search["metadata"]["ranking_mode"] == "search_personalized_relevance"
    assert relevance_search["metadata"]["personalization_enabled"] is True
    assert relevance_search["items"], "Expected relevance search items."
    assert relevance_search["items"][0]["discovery"] is not None
    assert relevance_search["items"][0]["personalization"] is not None
    assert relevance_search["items"][0]["discovery"]["personalization_applied"] is True

    personalized_search = search_courses(
        headers,
        query="machine learning python beginner",
        sort_by="personalized",
        language="en",
    )
    assert personalized_search["metadata"]["ranking_mode"] == "search_personalized"
    assert personalized_search["metadata"]["personalization_enabled"] is True
    assert personalized_search["metadata"]["personalized_result_count"] > 0
    assert personalized_search["metadata"]["explanation_result_count"] > 0
    assert personalized_search["items"], "Expected personalized search items."

    first_personalized_item = personalized_search["items"][0]
    assert first_personalized_item["personalization"] is not None
    assert first_personalized_item["discovery"] is not None
    assert first_personalized_item["discovery"]["personalization_applied"] is True
    assert first_personalized_item["discovery"]["ranking_reasons"]

    compatibility_cards = list_courses(
        headers,
        query="python beginner",
        sort_by="quality",
        language="en",
    )
    assert compatibility_cards, (
        "Expected compatibility course cards. If provider ingestion was skipped, the existing catalog must still be usable."
    )
    assert compatibility_cards[0]["card_summary"]

    course_card = get_course(headers, first_personalized_item["id"])
    assert course_card["id"] == first_personalized_item["id"]
    assert course_card["personalization"] is not None

    print_step("RECOMMENDATIONS")
    recommendation_payload = read_recommendations(headers, limit=5)
    assert recommendation_payload["total"] > 0
    assert recommendation_payload["items"], "Expected recommendations."
    assert recommendation_payload["items"][0]["personalization"] is not None

    print_step("COURSE STRUCTURE BUILD AND READ")
    selected_courses = choose_plan_courses(personalized_search, recommendation_payload, compatibility_cards)
    primary_course = selected_courses[0]
    secondary_course = selected_courses[1]

    structure = build_course_structure(headers, primary_course["id"])
    assert structure["build_status"] == "built"
    assert structure["total_units"] > 0
    assert structure["total_minutes"] > 0

    structure_read = get_course_structure(headers, primary_course["id"])
    assert structure_read["id"] == structure["id"]

    units = get_course_units(headers, primary_course["id"])
    assert len(units) == structure["total_units"]

    print_step("QUEUE AND PLAN LIFECYCLE GUARDRAILS")
    queue_add_primary = add_course_to_queue(
        headers,
        primary_course["id"],
        "Primary course for full regression.",
    )
    assert_status(queue_add_primary, 201)
    queue_item_primary = queue_add_primary.json()

    duplicate_queue_add = add_course_to_queue(
        headers,
        primary_course["id"],
        "Duplicate queue add should fail.",
    )
    assert_error(duplicate_queue_add, 409, "conflict")

    queue_add_secondary = add_course_to_queue(
        headers,
        secondary_course["id"],
        "Secondary course for full regression.",
    )
    assert_status(queue_add_secondary, 201)
    queue_item_secondary = queue_add_secondary.json()

    queue_items = read_queue(headers)
    queued_course_ids = {item["course_id"] for item in queue_items}
    assert primary_course["id"] in queued_course_ids
    assert secondary_course["id"] in queued_course_ids

    create_plan_response = create_plan(
        headers,
        [queue_item_primary["id"], queue_item_secondary["id"]],
    )
    assert_status(create_plan_response, 201)
    plan = create_plan_response.json()
    assert plan["status"] == "active"
    assert plan["schedule_timezone_snapshot"] == "Asia/Riyadh"
    assert len(plan["courses"]) == 2

    duplicate_open_plan_response = create_plan(
        headers,
        [queue_item_primary["id"]],
    )
    assert_error(duplicate_open_plan_response, 409, "conflict")

    active_plan = read_active_plan(headers)
    assert active_plan["id"] == plan["id"]

    all_plans = read_plans(headers)
    assert any(item["id"] == plan["id"] for item in all_plans)

    stored_plan = read_plan(headers, plan["id"])
    assert stored_plan["schedule_timezone_snapshot"] == "Asia/Riyadh"

    readiness_before_schedule = read_plan_readiness(headers, plan["id"])
    assert readiness_before_schedule["is_ready_for_schedule_generation"] is True
    assert readiness_before_schedule["has_schedule_items"] is False

    updated_preference = update_plan_preferences(headers, plan)
    plan = read_plan(headers, plan["id"])
    assert updated_preference["preferred_time_window"] == "night"
    assert updated_preference["max_daily_minutes"] == 80
    assert updated_preference["session_cap_minutes"] == 25

    print_step("SCHEDULE GENERATION AND REGENERATION GUARDRAILS")
    generate_schedule_response = generate_schedule(headers, plan)
    assert_status(generate_schedule_response, 200)
    schedule = generate_schedule_response.json()
    assert schedule["total_items"] > 0
    assert schedule["total_minutes"] > 0
    assert schedule["items"], "Expected schedule items after generation."

    second_generate_response = generate_schedule(headers, read_plan(headers, plan["id"]))
    assert_error(second_generate_response, 409, "conflict")

    plan_items = read_plan_items(headers, plan["id"])
    assert len(plan_items) == schedule["total_items"]
    actionable_items = read_plan_items(headers, plan["id"], actionable_only=True)
    assert actionable_items, "Expected actionable schedule items."

    print_step("EXECUTION GUARDRAILS")
    paused_plan = update_plan_status(headers, read_plan(headers, plan["id"]), "paused")
    assert paused_plan["status"] == "paused"

    paused_start_response = start_plan_item(headers, plan["id"], actionable_items[0])
    assert_error(paused_start_response, 409, "conflict")

    reactivated_plan = update_plan_status(headers, paused_plan, "active")
    assert reactivated_plan["status"] == "active"

    first_item = read_plan_items(headers, plan["id"], actionable_only=True)[0]

    start_response = start_plan_item(headers, plan["id"], first_item)
    assert_status(start_response, 200)
    started_item = start_response.json()["item"]
    assert started_item["status"] == "in_progress"

    duplicate_start_response = start_plan_item(headers, plan["id"], started_item)
    assert_error(duplicate_start_response, 409, "conflict")

    complete_response = complete_plan_item(
        headers,
        plan["id"],
        started_item,
        actual_minutes=max(first_item["planned_minutes"], 1),
    )
    assert_status(complete_response, 200)
    completed_item = complete_response.json()["item"]
    assert completed_item["status"] == "completed"

    duplicate_complete_response = complete_plan_item(
        headers,
        plan["id"],
        completed_item,
        actual_minutes=max(first_item["planned_minutes"], 1),
    )
    assert_error(duplicate_complete_response, 409, "conflict")

    refreshed_items = read_plan_items(headers, plan["id"])
    pending_items = [item for item in refreshed_items if item["status"] == "pending"]
    assert pending_items, "Expected pending items after completing the first schedule item."

    second_item = pending_items[0]
    skip_response = skip_plan_item(
        headers,
        plan["id"],
        second_item,
        "Full regression skip verification.",
    )
    assert_status(skip_response, 200)
    skipped_item = skip_response.json()["item"]
    assert skipped_item["status"] == "skipped"

    start_skipped_response = start_plan_item(headers, plan["id"], skipped_item)
    assert_error(start_skipped_response, 409, "conflict")

    print_step("TIMEZONE SNAPSHOT STABILITY")
    updated_profile = update_profile(
        headers,
        timezone_name="America/New_York",
        experience_level="intermediate",
    )
    assert updated_profile["timezone"] == "America/New_York"
    plan_after_profile_change = read_plan(headers, plan["id"])
    assert plan_after_profile_change["schedule_timezone_snapshot"] == "Asia/Riyadh"

    print_step("STRUCTURE REBUILD SAFETY AFTER PLAN LINKAGE")
    rebuilt_structure = build_course_structure(headers, primary_course["id"])
    assert rebuilt_structure["total_units"] > 0
    assert rebuilt_structure["total_minutes"] > 0

    print_step("RECOVERY AND FORCE-REGEN GUARDRAILS")
    items_after_skip = read_plan_items(headers, plan["id"])
    remaining_pending_items = [item for item in items_after_skip if item["status"] == "pending"]
    assert remaining_pending_items, "Expected pending items for overdue and recovery validation."

    overdue_target = remaining_pending_items[0]
    set_item_as_overdue(overdue_target["id"])

    execution_summary = read_execution_summary(headers, plan["id"])
    assert execution_summary["completed_items_count"] >= 1
    assert execution_summary["skipped_items_count"] >= 1
    assert execution_summary["overdue_items_count"] >= 1

    recovery_preview = read_recovery_preview(headers, plan["id"])
    assert recovery_preview["needs_recovery"] is True
    assert recovery_preview["overdue_items_count"] >= 1
    assert recovery_preview["recommended_action"] in {"stay_on_track", "rebuild"}

    recovery_result = apply_recovery(headers, read_plan(headers, plan["id"]), recovery_preview)
    assert recovery_result["schedule_revision"] == 2
    assert recovery_result["recovery_mode"] == "rebalance"

    force_regeneration_response = generate_schedule(headers, read_plan(headers, plan["id"]), force_rebuild=True)
    assert_error(force_regeneration_response, 409, "conflict")

    readiness_after_recovery = read_plan_readiness(headers, plan["id"])
    assert readiness_after_recovery["schedule_revision"] == 2
    assert readiness_after_recovery["has_schedule_items"] is True

    print_step("EVENT BRIDGE AND LEARNING STATE FINAL CHECK")
    events = read_events(headers, limit=100)
    event_types = {event["event_type"] for event in events}
    for required_event in {
        "onboarding_completed",
        "plan_item_started",
        "plan_item_completed",
        "plan_item_skipped",
    }:
        assert required_event in event_types, f"Missing expected event: {required_event}"

    final_learning_state = read_learning_state(headers)
    assert final_learning_state["engagement_score"] > 0
    assert final_learning_state["profile_alignment"]["primary_track"] == "data_science"
    assert isinstance(final_learning_state["dominant_interests"], list)

    print_step("FULL PLATFORM SYSTEM REGRESSION PASSED")
    print(
        json.dumps(
            {
                "registered_user_id": user_registration["id"],
                "user_id": current_user["id"],
                "profile_id": profile["id"],
                "updated_profile_timezone": updated_profile["timezone"],
                "plan_timezone_snapshot": plan_after_profile_change["schedule_timezone_snapshot"],
                "optional_ingestion": {
                    "attempted": optional_ingestion["attempted"],
                    "succeeded": optional_ingestion["succeeded"],
                    "skipped_due_to_provider": optional_ingestion["skipped_due_to_provider"],
                    "details": (
                        {
                            "ingestion_id": ingestion["ingestion_id"],
                            "total_promoted_courses": ingestion["total_promoted_courses"],
                            "raw_course_count_checked": len(raw_courses),
                        }
                        if ingestion is not None
                        else optional_ingestion["payload"]
                    ),
                },
                "search": {
                    "relevance_mode": relevance_search["metadata"]["ranking_mode"],
                    "personalized_mode": personalized_search["metadata"]["ranking_mode"],
                    "personalized_result_count": personalized_search["metadata"]["personalized_result_count"],
                },
                "structure": {
                    "course_id": primary_course["id"],
                    "structure_id": structure["id"],
                    "total_units": structure["total_units"],
                    "total_minutes": structure["total_minutes"],
                },
                "plan": {
                    "plan_id": plan["id"],
                    "status": read_plan(headers, plan["id"])["status"],
                    "schedule_revision": recovery_result["schedule_revision"],
                    "schedule_total_items": schedule["total_items"],
                },
                "execution_summary": execution_summary,
                "recovery_preview": {
                    "needs_recovery": recovery_preview["needs_recovery"],
                    "recommended_action": recovery_preview["recommended_action"],
                    "overdue_items_count": recovery_preview["overdue_items_count"],
                },
                "learning_state": {
                    "engagement_score": final_learning_state["engagement_score"],
                    "current_focus": final_learning_state["current_focus"],
                    "dominant_interests": final_learning_state["dominant_interests"],
                },
                "event_types": sorted(event_types),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
