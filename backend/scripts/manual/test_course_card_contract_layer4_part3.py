import json
from datetime import UTC, datetime
from typing import Any

import requests


BASE_URL = "http://127.0.0.1:8000"
TEST_PASSWORD = "123456"


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> None:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )


def build_unique_email() -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"course_card_{timestamp}@example.com"


def register_user(email: str) -> dict[str, Any]:
    print_step("REGISTER USER")
    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "full_name": "Course Card User",
            "password": TEST_PASSWORD,
        },
        timeout=30,
    )
    assert_status(response, 201)
    return response.json()


def login_and_get_token(email: str) -> str:
    print_step("LOGIN")
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": TEST_PASSWORD},
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
            "weekly_hours": 10,
            "goal": "job",
            "preferred_language": "en",
            "bio": "Interested in machine learning systems and practical Python learning.",
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
        headers={**headers, "Content-Type": "application/json"},
        json={"query": "python machine learning", "max_results_per_type": 5},
        timeout=60,
    )
    assert_status(response, 201)
    return response.json()


def list_course_cards() -> list[dict[str, Any]]:
    print_step("LIST COURSE CARDS")
    response = requests.get(
        f"{BASE_URL}/courses",
        params={"source": "youtube", "language": "en", "limit": 5, "sort_by": "quality", "q": "python"},
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def get_course_card(course_id: int) -> dict[str, Any]:
    print_step("GET COURSE CARD")
    response = requests.get(f"{BASE_URL}/courses/{course_id}", timeout=30)
    assert_status(response, 200)
    return response.json()


def get_recommendations(headers: dict[str, str]) -> dict[str, Any]:
    print_step("GET RECOMMENDATIONS")
    response = requests.get(
        f"{BASE_URL}/recommendations",
        headers=headers,
        params={"limit": 5},
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def assert_base_card_shape(card: dict[str, Any]) -> None:
    required_fields = [
        "id",
        "source",
        "external_id",
        "content_type",
        "content_format_label",
        "title",
        "provider",
        "provider_display_name",
        "difficulty_level",
        "difficulty_label",
        "duration_minutes_total",
        "duration_is_estimated",
        "duration_label",
        "pricing_model",
        "pricing_label",
        "is_free",
        "topic_tags",
        "topic_tag_labels",
        "quality_score",
        "quality_tier",
        "progression_hint",
        "progression_label",
        "provider_metadata",
        "url",
        "thumbnail_url",
        "card_summary",
        "badges",
        "personalization",
    ]
    for field in required_fields:
        assert field in card, f"Missing field on course card: {field}"

    assert isinstance(card["badges"], list)
    assert isinstance(card["topic_tags"], list)
    assert isinstance(card["topic_tag_labels"], list)
    assert isinstance(card["provider_metadata"], dict)


def assert_personalized_card_shape(card: dict[str, Any]) -> None:
    personalization = card.get("personalization")
    assert personalization is not None, "Expected recommendation card personalization block."

    for field in [
        "fit_label",
        "fit_score",
        "matched_focus",
        "fit_reason",
        "reason_codes",
        "why_now",
        "matched_topics",
        "covered_topic_overlap",
        "score_breakdown",
        "history_details",
        "profile_alignment",
    ]:
        assert field in personalization, f"Missing personalization field: {field}"

    assert isinstance(personalization["reason_codes"], list)
    assert isinstance(personalization["why_now"], list)
    assert isinstance(personalization["score_breakdown"], dict)


def main() -> None:
    email = build_unique_email()
    register_user(email)
    token = login_and_get_token(email)
    headers = auth_headers(token)

    create_profile(headers)
    ingest_courses(headers)

    course_cards = list_course_cards()
    assert len(course_cards) > 0, "Expected at least one course card."

    first_card = course_cards[0]
    assert_base_card_shape(first_card)
    assert first_card["personalization"] is None

    single_card = get_course_card(first_card["id"])
    assert_base_card_shape(single_card)
    assert single_card["id"] == first_card["id"]
    assert single_card["personalization"] is None

    recommendations = get_recommendations(headers)
    assert recommendations["total"] > 0, "Expected at least one recommendation."
    assert len(recommendations["items"]) > 0, "Expected recommendation items."

    first_recommendation = recommendations["items"][0]
    assert_base_card_shape(first_recommendation)
    assert_personalized_card_shape(first_recommendation)

    print_step("COURSE CARD CONTRACT LAYER 4 PART 3 PASSED")
    print(
        json.dumps(
            {
                "listed_course_card": first_card,
                "recommended_course_card": first_recommendation,
                "recommendation_total": recommendations["total"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
