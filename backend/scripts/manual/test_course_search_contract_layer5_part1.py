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


def search_courses() -> dict[str, Any]:
    print_step("SEARCH COURSE CATALOG")

    response = requests.get(
        f"{BASE_URL}/courses/search",
        params={
            "q": "python beginner",
            "language": "en",
            "sort_by": "relevance",
            "limit": 5,
            "offset": 0,
        },
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def list_courses_compatibility() -> list[dict[str, Any]]:
    print_step("LIST COURSES COMPATIBILITY")

    response = requests.get(
        f"{BASE_URL}/courses",
        params={
            "q": "python beginner",
            "language": "en",
            "sort_by": "quality",
            "limit": 5,
            "offset": 0,
        },
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    ingest_result = ingest_courses(headers)
    assert ingest_result["total_promoted_courses"] > 0, "Expected promoted courses from ingestion."

    search_result = search_courses()

    items = search_result["items"]
    metadata = search_result["metadata"]
    facets = search_result["facets"]
    applied_filters = search_result["applied_filters"]

    assert len(items) > 0, "Expected search to return at least one course."
    assert metadata["total"] >= metadata["returned_count"] >= 1
    assert metadata["sort_by"] == "relevance"
    assert metadata["ranking_mode"] == "search_relevance"
    assert "python" in metadata["query_tokens"]
    assert applied_filters["q"] == "python beginner"
    assert applied_filters["language"] == "en"

    assert isinstance(facets["languages"], list)
    assert isinstance(facets["content_types"], list)
    assert isinstance(facets["difficulty_levels"], list)
    assert isinstance(facets["pricing_models"], list)
    assert isinstance(facets["progression_hints"], list)
    assert isinstance(facets["topic_tags"], list)

    first_item = items[0]
    assert "card_summary" in first_item
    assert "badges" in first_item
    assert "topic_tags" in first_item
    assert "personalization" in first_item

    compatibility_items = list_courses_compatibility()
    assert len(compatibility_items) > 0, "Compatibility /courses endpoint must still return items."
    assert "card_summary" in compatibility_items[0]
    assert "badges" in compatibility_items[0]

    print_step("COURSE SEARCH CONTRACT LAYER 5 PART 1 PASSED")
    print(
        json.dumps(
            {
                "search_metadata": metadata,
                "applied_filters": applied_filters,
                "first_item": first_item,
                "compatibility_first_item": compatibility_items[0],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()