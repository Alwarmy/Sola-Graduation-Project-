from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import requests


BASE_URL = "http://127.0.0.1:8000"


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> None:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )


def build_unique_email() -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"search_personalization_{timestamp}@example.com"


def register_user(email: str, password: str) -> dict[str, Any]:
    print_step("REGISTER USER")

    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "full_name": "Search Personalization User",
            "password": password,
        },
        timeout=30,
    )
    assert_status(response, 201)
    return response.json()


def login_and_get_token(email: str, password: str) -> str:
    print_step("LOGIN")

    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "email": email,
            "password": password,
        },
        timeout=30,
    )
    assert_status(response, 200)
    print("Login successful.")
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_profile(headers: dict[str, str]) -> dict[str, Any]:
    print_step("CREATE PROFILE")

    response = requests.post(
        f"{BASE_URL}/profile",
        headers={
            **headers,
            "Content-Type": "application/json",
        },
        json={
            "background_track": "data_science",
            "primary_track": "data_science",
            "secondary_tracks": ["ai_ml"],
            "target_role": "Machine Learning Engineer",
            "experience_level": "beginner",
            "employment_status": "job_seeker",
            "is_student": True,
            "education_major": "Software Engineering",
            "weekly_hours": 10,
            "goal": "job",
            "preferred_language": "en",
            "bio": "Interested in machine learning, python, and practical data systems.",
            "timezone": "Asia/Riyadh",
        },
        timeout=30,
    )
    assert_status(response, 201)
    return response.json()


def ingest_courses(headers: dict[str, str]) -> dict[str, Any]:
    print_step("INGEST COURSES")

    response = requests.post(
        f"{BASE_URL}/courses/ingest",
        headers={
            **headers,
            "Content-Type": "application/json",
        },
        json={
            "query": "machine learning python beginner",
            "max_results_per_type": 5,
        },
        timeout=60,
    )
    assert_status(response, 201)
    return response.json()


def search_courses(headers: dict[str, str]) -> dict[str, Any]:
    print_step("SEARCH PERSONALIZED COURSE CATALOG")

    response = requests.get(
        f"{BASE_URL}/courses/search",
        headers=headers,
        params={
            "q": "machine learning python beginner",
            "language": "en",
            "sort_by": "personalized",
            "limit": 5,
            "offset": 0,
        },
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def list_courses_compatibility(headers: dict[str, str]) -> list[dict[str, Any]]:
    print_step("LIST COURSES COMPATIBILITY")

    response = requests.get(
        f"{BASE_URL}/courses",
        headers=headers,
        params={
            "q": "machine learning python beginner",
            "language": "en",
            "sort_by": "personalized",
            "limit": 5,
            "offset": 0,
        },
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def main() -> None:
    email = build_unique_email()
    password = "123456"

    register_user(email, password)
    token = login_and_get_token(email, password)
    headers = auth_headers(token)

    create_profile(headers)
    ingest_result = ingest_courses(headers)
    assert ingest_result["total_promoted_courses"] > 0, "Expected promoted courses from ingestion."

    search_result = search_courses(headers)
    metadata = search_result["metadata"]
    items = search_result["items"]

    assert metadata["personalization_enabled"] is True
    assert metadata["personalized_result_count"] >= 1
    assert metadata["sort_by"] == "personalized"
    assert metadata["ranking_mode"] in {"search_personalized", "personalized_discovery"}
    assert metadata["primary_track"] == "data_science"
    assert metadata["experience_level"] == "beginner"
    assert metadata["query_difficulty_hint"] == "beginner"

    assert len(items) > 0, "Expected personalized search results."
    assert items[0]["personalization"] is not None, "Expected personalization block in search results."

    personalization = items[0]["personalization"]
    assert personalization["fit_label"] in {
        "excellent_fit",
        "strong_fit",
        "good_fit",
        "possible_fit",
    }
    assert isinstance(personalization["why_now"], list)
    assert isinstance(personalization["score_breakdown"], dict)

    compatibility_items = list_courses_compatibility(headers)
    assert len(compatibility_items) > 0, "Compatibility endpoint must still return items."
    assert compatibility_items[0]["personalization"] is not None

    print_step("COURSE SEARCH PERSONALIZATION LAYER 5 PART 2 PASSED")
    print(
        json.dumps(
            {
                "search_metadata": metadata,
                "first_item": items[0],
                "compatibility_first_item": compatibility_items[0],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
