import pytest

from app.core.security import decode_access_token
from app.models.auth_refresh_token import AuthRefreshToken


pytestmark = pytest.mark.integration


def test_login_refresh_reuse_detection_and_family_revocation(
    client,
    db_session,
    create_user_bundle,
) -> None:
    user = create_user_bundle(email="auth@example.com", password="Secret123!")

    login_response = client.post(
        "/auth/login",
        json={"email": user.email, "password": "Secret123!"},
    )

    assert login_response.status_code == 200
    login_payload = login_response.json()
    assert login_payload["token_type"] == "bearer"
    assert login_payload["refresh_token"]
    assert login_payload["session_id"]
    assert login_payload["access_token_expires_in_seconds"] > 0
    assert login_payload["refresh_token_expires_in_seconds"] > 0

    access_claims = decode_access_token(login_payload["access_token"])
    assert access_claims["sub"] == str(user.id)
    assert access_claims["sid"] == login_payload["session_id"]

    stored_tokens = db_session.query(AuthRefreshToken).order_by(AuthRefreshToken.id.asc()).all()
    assert len(stored_tokens) == 1
    assert stored_tokens[0].token_hash != login_payload["refresh_token"]
    assert stored_tokens[0].token_id == login_payload["refresh_token"].split(".", 1)[0]

    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": login_payload["refresh_token"]},
    )

    assert refresh_response.status_code == 200
    refresh_payload = refresh_response.json()
    assert refresh_payload["refresh_token"] != login_payload["refresh_token"]
    assert refresh_payload["session_id"] == login_payload["session_id"]

    db_session.expire_all()
    stored_tokens = db_session.query(AuthRefreshToken).order_by(AuthRefreshToken.id.asc()).all()
    assert len(stored_tokens) == 2
    assert stored_tokens[0].rotated_at is not None
    assert stored_tokens[1].parent_token_id == stored_tokens[0].id

    reused_response = client.post(
        "/auth/refresh",
        json={"refresh_token": login_payload["refresh_token"]},
    )

    assert reused_response.status_code == 401
    assert reused_response.json()["error_code"] == "refresh_token_reused"

    db_session.expire_all()
    revoked_family = (
        db_session.query(AuthRefreshToken)
        .filter(AuthRefreshToken.session_id == login_payload["session_id"])
        .order_by(AuthRefreshToken.id.asc())
        .all()
    )
    assert revoked_family
    assert all(token.revoked_at is not None for token in revoked_family)

    latest_refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_payload["refresh_token"]},
    )

    assert latest_refresh_response.status_code == 401
    assert latest_refresh_response.json()["error_code"] == "refresh_token_reused"


def test_logout_revokes_refresh_session(client, db_session, create_user_bundle) -> None:
    user = create_user_bundle(email="logout@example.com", password="Secret123!")

    login_response = client.post(
        "/auth/login",
        json={"email": user.email, "password": "Secret123!"},
    )
    refresh_token = login_response.json()["refresh_token"]
    session_id = login_response.json()["session_id"]

    logout_response = client.post(
        "/auth/logout",
        json={"refresh_token": refresh_token},
    )

    assert logout_response.status_code == 204

    revoked_response = client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
    )

    assert revoked_response.status_code == 401
    assert revoked_response.json()["error_code"] == "refresh_token_revoked"

    db_session.expire_all()
    stored_tokens = (
        db_session.query(AuthRefreshToken)
        .filter(AuthRefreshToken.session_id == session_id)
        .all()
    )
    assert stored_tokens
    assert all(token.revoked_at is not None for token in stored_tokens)
    assert all(token.revocation_reason == "logout" for token in stored_tokens)
