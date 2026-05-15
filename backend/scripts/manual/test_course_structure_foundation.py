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


def load_candidate_course(content_type: str) -> dict[str, Any]:
    print_step(f"LOAD {content_type.upper()} COURSE")

    response = requests.get(
        f"{BASE_URL}/courses",
        params={
            "content_type": content_type,
            "language": "en",
            "limit": 20,
            "offset": 0,
        },
        timeout=30,
    )
    assert_status(response, 200)

    items = response.json()
    assert len(items) > 0, f"No {content_type} course available for structure testing."
    course = items[0]
    print(f"Selected course_id={course['id']} title={course['title']}")
    return course


def build_structure(
    headers: dict[str, str],
    course_id: int,
    force_rebuild: bool = True,
) -> dict[str, Any]:
    response = requests.post(
        f"{BASE_URL}/course-structures/{course_id}/build",
        params={"force_rebuild": str(force_rebuild).lower()},
        headers=headers,
        timeout=120,
    )
    assert_status(response, 200)
    return response.json()


def read_structure(headers: dict[str, str], course_id: int) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/course-structures/{course_id}",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def read_units(headers: dict[str, str], course_id: int) -> list[dict[str, Any]]:
    response = requests.get(
        f"{BASE_URL}/course-structures/{course_id}/units",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def assert_playlist_structure(structure: dict[str, Any]) -> None:
    print_step("ASSERT PLAYLIST STRUCTURE")

    assert structure["structure_type"] == "playlist"
    assert structure["build_status"] == "built"
    assert structure["total_units"] > 0
    assert structure["total_minutes"] > 0
    assert len(structure["units"]) == structure["total_units"]

    first_unit = structure["units"][0]
    assert first_unit["unit_type"] == "playlist_video"
    assert first_unit["source_order_index"] == 1
    assert first_unit["estimated_minutes"] > 0
    assert first_unit["start_second"] is None
    assert first_unit["end_second"] is None

    print("Playlist structure looks correct.")


def assert_single_video_structure(structure: dict[str, Any]) -> None:
    print_step("ASSERT SINGLE VIDEO STRUCTURE")

    assert structure["structure_type"] == "single_video"
    assert structure["build_status"] == "built"
    assert structure["total_units"] > 0
    assert structure["total_minutes"] > 0
    assert len(structure["units"]) == structure["total_units"]

    for index, unit in enumerate(structure["units"], start=1):
        assert unit["unit_type"] == "video_chunk"
        assert unit["source_order_index"] == index
        assert unit["estimated_minutes"] <= 45
        assert unit["start_second"] is not None
        assert unit["end_second"] is not None
        assert unit["end_second"] > unit["start_second"]

    print("Single video chunking looks correct.")


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    playlist_course = load_candidate_course("playlist")
    video_course = load_candidate_course("video")

    playlist_structure = build_structure(headers, playlist_course["id"], force_rebuild=True)
    assert_playlist_structure(playlist_structure)

    playlist_structure_read = read_structure(headers, playlist_course["id"])
    playlist_units = read_units(headers, playlist_course["id"])
    assert playlist_structure_read["total_units"] == len(playlist_units)

    video_structure = build_structure(headers, video_course["id"], force_rebuild=True)
    assert_single_video_structure(video_structure)

    video_structure_read = read_structure(headers, video_course["id"])
    video_units = read_units(headers, video_course["id"])
    assert video_structure_read["total_units"] == len(video_units)

    print_step("COURSE STRUCTURE FOUNDATION TEST PASSED")
    print(
        json.dumps(
            {
                "playlist_course_id": playlist_course["id"],
                "playlist_total_units": playlist_structure_read["total_units"],
                "video_course_id": video_course["id"],
                "video_total_units": video_structure_read["total_units"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()