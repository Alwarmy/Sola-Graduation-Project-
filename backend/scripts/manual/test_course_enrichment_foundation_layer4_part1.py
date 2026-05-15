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
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30,
    )
    assert_status(response, 200)
    print("Login successful.")
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def ingest_courses(headers: dict[str, str]) -> dict[str, Any]:
    print_step("INGEST COURSES")

    response = requests.post(
        f"{BASE_URL}/courses/ingest",
        headers={
            **headers,
            "Content-Type": "application/json",
        },
        json={
            "query": "python beginner",
            "max_results_per_type": 5,
        },
        timeout=60,
    )
    assert_status(response, 201)
    return response.json()


def list_courses() -> list[dict[str, Any]]:
    print_step("LIST COURSES")

    response = requests.get(
        f"{BASE_URL}/courses",
        params={"source": "youtube", "language": "en", "limit": 10, "offset": 0, "sort_by": "quality"},
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def assert_course_card_shape(course: dict[str, Any]) -> None:
    assert "provider_display_name" in course
    assert "content_format_label" in course
    assert "short_description" in course
    assert "difficulty_label" in course
    assert "duration_label" in course
    assert "pricing_label" in course
    assert "is_free" in course
    assert "topic_tag_labels" in course
    assert "quality_tier" in course
    assert "card_summary" in course
    assert "badges" in course
    assert "personalization" in course

    assert "instructor_name" in course
    assert "difficulty_level" in course
    assert "duration_minutes_total" in course
    assert "duration_is_estimated" in course
    assert "pricing_model" in course
    assert "topic_tags" in course
    assert "quality_score" in course
    assert "quality_signals" in course
    assert "prerequisite_hint" in course
    assert "progression_hint" in course
    assert "provider_metadata" in course

    assert course["pricing_model"] == "free"
    assert course["pricing_label"] == "Free"
    assert course["is_free"] is True
    assert isinstance(course["topic_tags"], list)
    assert isinstance(course["topic_tag_labels"], list)
    assert isinstance(course["quality_signals"], dict)
    assert isinstance(course["provider_metadata"], dict)
    assert isinstance(course["badges"], list)


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    ingest_result = ingest_courses(headers)
    courses_from_ingest = ingest_result["courses"]
    assert len(courses_from_ingest) > 0, "Expected at least one promoted course from ingest."

    print_step("ASSERT ENRICHMENT FIELDS ON INGEST RESPONSE")
    for course in courses_from_ingest:
        assert_course_card_shape(course)
        assert course["personalization"] is None

    assert any(course.get("difficulty_level") is not None for course in courses_from_ingest), (
        "Expected at least one course to have difficulty_level."
    )
    assert any(course.get("duration_minutes_total") is not None for course in courses_from_ingest), (
        "Expected at least one course to have duration_minutes_total."
    )
    assert any(len(course.get("topic_tags", [])) > 0 for course in courses_from_ingest), (
        "Expected at least one course to have topic_tags."
    )

    listed_courses = list_courses()
    assert len(listed_courses) > 0, "Expected listed courses to be available."

    print_step("ASSERT ENRICHMENT FIELDS ON COURSE LIST RESPONSE")
    for course in listed_courses[:5]:
        assert_course_card_shape(course)
        assert course["personalization"] is None

    print_step("COURSE ENRICHMENT FOUNDATION LAYER 4 PART 1 PASSED")
    print(
        json.dumps(
            {
                "ingestion_id": ingest_result["ingestion_id"],
                "total_promoted_courses": ingest_result["total_promoted_courses"],
                "sample_course": courses_from_ingest[0],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
