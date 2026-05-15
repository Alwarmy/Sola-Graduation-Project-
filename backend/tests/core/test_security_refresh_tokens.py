from types import SimpleNamespace

from app.api.deps import _resolve_user_from_token
from app.core.config import get_settings
from app.core.security import (
    build_refresh_token_value,
    create_access_token,
    decode_access_token,
    generate_refresh_token_id,
    generate_refresh_token_secret,
    hash_refresh_token,
    verify_refresh_token,
)
from app.services.auth_session_service import issue_user_session


class _DummySession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0

    def add(self, value: object) -> None:
        self.added.append(value)

    def commit(self) -> None:
        self.commits += 1


class _DummyQuery:
    def __init__(self, value):
        self._value = value

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._value


class _DummyDb:
    def __init__(self, user):
        self._user = user

    def query(self, _model):
        return _DummyQuery(self._user)


def test_refresh_token_hashing_uses_keyed_digest_and_verifies(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "unit-test-jwt-secret")
    monkeypatch.setenv("REFRESH_TOKEN_SECRET", "unit-test-refresh-secret")
    get_settings.cache_clear()

    token = build_refresh_token_value(
        token_id=generate_refresh_token_id(),
        token_secret=generate_refresh_token_secret(),
    )

    token_hash = hash_refresh_token(token)

    assert token_hash != token
    assert verify_refresh_token(token=token, token_hash=token_hash) is True
    assert verify_refresh_token(token=f"{token}tampered", token_hash=token_hash) is False

    get_settings.cache_clear()


def test_issue_user_session_persists_only_hashed_refresh_token_and_audit_session_claim(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "unit-test-jwt-secret")
    monkeypatch.setenv("REFRESH_TOKEN_SECRET", "unit-test-refresh-secret")
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
    monkeypatch.setenv("REFRESH_TOKEN_EXPIRE_DAYS", "30")
    get_settings.cache_clear()

    db = _DummySession()
    user = SimpleNamespace(id=17)

    tokens = issue_user_session(
        db=db,
        user=user,
        client_ip="203.0.113.5",
        user_agent="pytest-agent",
    )

    assert db.commits == 1
    assert len(db.added) == 1

    stored_token = db.added[0]
    assert stored_token.token_hash != tokens.refresh_token
    assert stored_token.token_hash != stored_token.token_id
    assert stored_token.created_ip == "203.0.113.5"
    assert stored_token.created_user_agent == "pytest-agent"
    assert verify_refresh_token(token=tokens.refresh_token, token_hash=stored_token.token_hash) is True
    assert tokens.refresh_token.startswith(f"{stored_token.token_id}.")

    access_claims = decode_access_token(tokens.access_token)
    assert access_claims["sub"] == "17"
    assert access_claims["sid"] == tokens.session_id

    get_settings.cache_clear()


def test_request_auth_remains_valid_without_session_claim(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "unit-test-jwt-secret")
    get_settings.cache_clear()

    token = create_access_token(subject="42")
    user = _resolve_user_from_token(token, _DummyDb(SimpleNamespace(id=42)))

    assert user.id == 42

    get_settings.cache_clear()
