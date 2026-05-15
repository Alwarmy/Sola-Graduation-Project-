from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("sqlalchemy")

from app.api.deps import get_current_user, get_db
from app.core.exceptions import ConflictException, PreconditionFailedException
from app.core.request_context import REQUEST_ID_HEADER
from app.main import app


def _override_db():
    yield object()


def _override_current_user():
    return SimpleNamespace(id=1)


def test_profile_route_returns_conflict_from_typed_service_exception(monkeypatch) -> None:
    def _raise_conflict(*args, **kwargs):
        raise ConflictException("User profile already exists.")

    monkeypatch.setattr("app.api.user_profiles.create_user_profile", _raise_conflict)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_current_user

    payload = {
        "background_track": "software_engineering",
        "primary_track": "software_engineering",
        "secondary_tracks": [],
        "employment_status": "job_seeker",
        "is_student": False,
        "weekly_hours": 10,
        "goal": "job",
        "preferred_language": "en",
        "timezone": "Asia/Riyadh",
    }

    try:
        with TestClient(app) as client:
            response = client.post(
                "/profile",
                headers={REQUEST_ID_HEADER: "profile-conflict-test"},
                json=payload,
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.headers[REQUEST_ID_HEADER] == "profile-conflict-test"
    assert response.json() == {
        "detail": "User profile already exists.",
        "error_code": "conflict",
        "request_id": "profile-conflict-test",
    }


def test_plan_execution_route_returns_precondition_failed_contract(monkeypatch) -> None:
    def _raise_precondition_failed(*args, **kwargs):
        raise PreconditionFailedException(
            "Learning plan item version is stale.",
            details={
                "resource": "learning_plan_item",
                "reason": "stale_version",
                "expected_version": 2,
                "current_version": 3,
            },
        )

    monkeypatch.setattr("app.api.plan_execution.start_learning_plan_item", _raise_precondition_failed)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_current_user

    try:
        with TestClient(app) as client:
            response = client.post(
                "/plans/10/items/20/start",
                headers={
                    REQUEST_ID_HEADER: "plan-precondition-test",
                    "X-Expected-Version": "2",
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 412
    assert response.headers[REQUEST_ID_HEADER] == "plan-precondition-test"
    assert response.json() == {
        "detail": "Learning plan item version is stale.",
        "error_code": "precondition_failed",
        "request_id": "plan-precondition-test",
        "details": {
            "resource": "learning_plan_item",
            "reason": "stale_version",
            "expected_version": 2,
            "current_version": 3,
        },
    }
