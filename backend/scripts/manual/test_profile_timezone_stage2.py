import json

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


def build_profile_payload(timezone_name: str | None) -> dict:
    return {
        "background_track": "software_engineering",
        "employment_status": "job_seeker",
        "is_student": True,
        "education_major": "Computer Science",
        "weekly_hours": 8,
        "goal": "job",
        "preferred_language": "any",
        "bio": "Timezone stage 2 verification profile.",
        "timezone": timezone_name,
    }


def create_or_replace_profile(headers: dict[str, str], timezone_name: str | None) -> dict:
    create_response = requests.post(
        f"{BASE_URL}/profile",
        headers=headers,
        json=build_profile_payload(timezone_name),
        timeout=30,
    )

    if create_response.status_code == 201:
        return create_response.json()

    update_response = requests.put(
        f"{BASE_URL}/profile",
        headers=headers,
        json=build_profile_payload(timezone_name),
        timeout=30,
    )
    assert_status(update_response, 200)
    return update_response.json()


def assert_invalid_timezone_rejected(headers: dict[str, str]) -> None:
    print_step("ASSERT INVALID TIMEZONE IS REJECTED")

    payload = build_profile_payload("Mars/Olympus")

    response = requests.put(
        f"{BASE_URL}/profile",
        headers=headers,
        json=payload,
        timeout=30,
    )

    assert response.status_code == 400, (
        f"Expected 400 for invalid timezone, got {response.status_code}: {response.text}"
    )
    print("Invalid timezone guardrail works.")


def main() -> None:
    token = login_and_get_token()
    headers = auth_headers(token)

    print_step("UPSERT PROFILE WITH EXPLICIT TIMEZONE")
    profile = create_or_replace_profile(headers, "America/New_York")
    assert profile["timezone"] == "America/New_York"
    print("Explicit timezone saved correctly.")

    print_step("UPSERT PROFILE WITH DIFFERENT EXPLICIT TIMEZONE")
    profile = create_or_replace_profile(headers, "Asia/Tokyo")
    assert profile["timezone"] == "Asia/Tokyo"
    print("Timezone update saved correctly.")

    assert_invalid_timezone_rejected(headers)

    print_step("PROFILE TIMEZONE STAGE 2 TEST PASSED")
    print(
        json.dumps(
            {
                "user_id": profile["user_id"],
                "saved_timezone": profile["timezone"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()