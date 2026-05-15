from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("sqlalchemy")

from app.api.deps import get_current_user, get_db
from app.core.exceptions import ConflictException
from app.core.request_context import REQUEST_ID_HEADER
from app.main import app


def _override_db():
    yield object()


def _override_current_user():
    return SimpleNamespace(id=1)


def test_assistant_action_confirm_route_returns_conflict_from_typed_service_exception(monkeypatch) -> None:
    def _raise_conflict(*args, **kwargs):
        raise ConflictException("Assistant action run is already executed.")

    monkeypatch.setattr("app.api.assistant.confirm_assistant_action_run", _raise_conflict)
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_current_user

    try:
        with TestClient(app) as client:
            response = client.post(
                "/assistant/action-runs/7/confirm",
                headers={REQUEST_ID_HEADER: "assistant-conflict-test"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.headers[REQUEST_ID_HEADER] == "assistant-conflict-test"
    assert response.json() == {
        "detail": "Assistant action run is already executed.",
        "error_code": "conflict",
        "request_id": "assistant-conflict-test",
    }
