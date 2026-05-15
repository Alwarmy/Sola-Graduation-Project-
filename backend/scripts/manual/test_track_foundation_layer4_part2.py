import json
from datetime import UTC, datetime
from typing import Any

import requests

from app.db.session import new_session
from app.models.user_learning_state import UserLearningState


BASE_URL = "http://127.0.0.1:8000"


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def assert_status(response: requests.Response, expected_status: int) -> None:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )


def build_unique_email() -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"track_foundation_{timestamp}@example.com"


def register_user(email: str, password: str) -> dict[str, Any]:
    print_step("REGISTER USER")

    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "full_name": "Track Foundation User",
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
        json={"email": email, "password": password},
        timeout=30,
    )
    assert_status(response, 200)
    print("Login successful.")
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def create_profile(headers: dict[str, str]) -> dict[str, Any]:
    print_step("CREATE PROFILE WITH TRACK FOUNDATION")

    response = requests.post(
        f"{BASE_URL}/profile",
        headers=headers,
        json={
            "background_track": "data_science",
            "primary_track": "data_science",
            "secondary_tracks": ["ai_ml", "software_engineering"],
            "target_role": "Data Engineer",
            "experience_level": "beginner",
            "employment_status": "job_seeker",
            "is_student": True,
            "education_major": "Software Engineering",
            "weekly_hours": 10,
            "goal": "job",
            "preferred_language": "en",
            "bio": "Interested in data engineering, pipelines, analytics, and ML systems.",
            "timezone": "Asia/Riyadh",
        },
        timeout=30,
    )
    assert_status(response, 201)
    return response.json()


def update_profile(headers: dict[str, str]) -> dict[str, Any]:
    print_step("UPDATE PROFILE WITH TRACK FOUNDATION")

    response = requests.put(
        f"{BASE_URL}/profile",
        headers=headers,
        json={
            "background_track": "data_science",
            "primary_track": "data_science",
            "secondary_tracks": ["ai_ml"],
            "target_role": "Machine Learning Engineer",
            "experience_level": "intermediate",
            "employment_status": "job_seeker",
            "is_student": True,
            "education_major": "Software Engineering",
            "weekly_hours": 12,
            "goal": "job",
            "preferred_language": "en",
            "bio": "Focused on machine learning systems and applied data products.",
            "timezone": "Asia/Riyadh",
        },
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def read_profile(headers: dict[str, str]) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/profile",
        headers=headers,
        timeout=30,
    )
    assert_status(response, 200)
    return response.json()


def load_learning_state(user_id: int) -> UserLearningState | None:
    db = new_session()
    try:
        return (
            db.query(UserLearningState)
            .filter(UserLearningState.user_id == user_id)
            .first()
        )
    finally:
        db.close()


def main() -> None:
    email = build_unique_email()
    password = "123456"

    registered_user = register_user(email, password)
    token = login_and_get_token(email, password)
    headers = auth_headers(token)

    created_profile = create_profile(headers)
    assert created_profile["background_track"] == "data_science"
    assert created_profile["primary_track"] == "data_science"
    assert created_profile["secondary_tracks"] == ["ai_ml", "software_engineering"]
    assert created_profile["target_role"] == "Data Engineer"
    assert created_profile["experience_level"] == "beginner"

    updated_profile = update_profile(headers)
    assert updated_profile["primary_track"] == "data_science"
    assert updated_profile["secondary_tracks"] == ["ai_ml"]
    assert updated_profile["target_role"] == "Machine Learning Engineer"
    assert updated_profile["experience_level"] == "intermediate"

    current_profile = read_profile(headers)
    assert current_profile["background_track"] == "data_science"
    assert current_profile["primary_track"] == "data_science"
    assert current_profile["secondary_tracks"] == ["ai_ml"]
    assert current_profile["target_role"] == "Machine Learning Engineer"
    assert current_profile["experience_level"] == "intermediate"

    learning_state = load_learning_state(registered_user["id"])
    assert learning_state is not None, "Learning state should exist after profile creation/update."

    profile_snapshot = learning_state.source_profile_snapshot or {}
    profile_alignment = learning_state.profile_alignment or {}

    assert profile_snapshot.get("primary_track") == "data_science"
    assert profile_snapshot.get("secondary_tracks") == ["ai_ml"]
    assert profile_snapshot.get("target_role") == "Machine Learning Engineer"
    assert profile_snapshot.get("experience_level") == "intermediate"

    assert profile_alignment.get("background_track") == "data_science"
    assert profile_alignment.get("primary_track") == "data_science"
    assert profile_alignment.get("secondary_tracks") == ["ai_ml"]
    assert profile_alignment.get("target_role") == "Machine Learning Engineer"
    assert profile_alignment.get("experience_level") == "intermediate"

    print_step("TRACK FOUNDATION LAYER 4 PART 2 PASSED")
    print(
        json.dumps(
            {
                "user_id": registered_user["id"],
                "profile": current_profile,
                "profile_alignment": profile_alignment,
                "source_profile_snapshot": profile_snapshot,
                "dominant_interests": learning_state.dominant_interests,
                "current_focus": learning_state.current_focus,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
