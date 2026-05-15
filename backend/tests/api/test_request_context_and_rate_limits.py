import pytest
from fastapi.testclient import TestClient
from types import SimpleNamespace

pytest.importorskip("sqlalchemy")

from app.api.deps import get_db
from app.core.rate_limiter import rate_limiter
from app.core.request_context import REQUEST_ID_HEADER
from app.main import app


def _override_db():
    yield object()


class _TestAuthSettings:
    AUTH_RATE_LIMIT_WINDOW_SECONDS = 60
    AUTH_LOGIN_ATTEMPTS_PER_IP = 1
    AUTH_LOGIN_ATTEMPTS_PER_IDENTIFIER = 1
    AUTH_REGISTER_ATTEMPTS_PER_IP = 1
    AUTH_REGISTER_ATTEMPTS_PER_IDENTIFIER = 1


def test_root_route_echoes_request_id_header() -> None:
    with TestClient(app) as client:
        response = client.get("/", headers={REQUEST_ID_HEADER: "root-request-id"})

    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER] == "root-request-id"


def test_login_route_returns_rate_limited_contract(monkeypatch) -> None:
    rate_limiter.reset()
    monkeypatch.setattr("app.api.auth.get_settings", lambda: _TestAuthSettings())
    monkeypatch.setattr("app.api.auth.login_user", lambda db, user_data: SimpleNamespace(id=7))
    monkeypatch.setattr(
        "app.api.auth.issue_user_session",
        lambda db, user, client_ip, user_agent: SimpleNamespace(
            to_dict=lambda: {
                "access_token": "access-token",
                "token_type": "bearer",
                "refresh_token": "refresh-token",
                "access_token_expires_in_seconds": 3600,
                "refresh_token_expires_in_seconds": 86400,
                "session_id": "session-1",
            }
        ),
    )
    app.dependency_overrides[get_db] = _override_db

    payload = {"email": "rate-limit@example.com", "password": "secret123"}

    try:
        with TestClient(app) as client:
            first_response = client.post("/auth/login", json=payload)
            second_response = client.post(
                "/auth/login",
                headers={REQUEST_ID_HEADER: "auth-rate-limit-test"},
                json=payload,
            )
    finally:
        app.dependency_overrides.clear()
        rate_limiter.reset()

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.headers[REQUEST_ID_HEADER] == "auth-rate-limit-test"
    assert second_response.headers["Retry-After"] == "60"
    body = second_response.json()
    assert body["detail"] == "Too many authentication attempts. Please try again later."
    assert body["error_code"] == "auth_rate_limited"
    assert body["request_id"] == "auth-rate-limit-test"
    assert body["details"]["scope"] == "auth_login_ip"
    assert body["details"]["retry_after_seconds"] == 60
    assert body["details"]["key"]
