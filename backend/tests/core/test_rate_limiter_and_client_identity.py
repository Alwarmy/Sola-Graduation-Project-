import sys
from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.core.config import Settings
from app.core.client_identity import resolve_client_ip
from app.core.rate_limiter import InMemoryRateLimiterBackend, RateLimiter, RedisRateLimiterBackend


def _build_request(*, client_host: str, forwarded_for: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode("utf-8")))

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "scheme": "http",
        "headers": headers,
        "client": (client_host, 12345),
    }
    return Request(scope)


def test_resolve_client_ip_uses_socket_peer_when_no_trusted_proxy(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.client_identity.get_settings",
        lambda: SimpleNamespace(TRUSTED_PROXY_DEPTH=0),
    )

    request = _build_request(
        client_host="198.51.100.50",
        forwarded_for="203.0.113.10, 10.0.0.1",
    )

    assert resolve_client_ip(request) == "198.51.100.50"


def test_resolve_client_ip_uses_forwarded_chain_before_trusted_proxy(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.client_identity.get_settings",
        lambda: SimpleNamespace(TRUSTED_PROXY_DEPTH=1),
    )

    request = _build_request(
        client_host="10.0.0.1",
        forwarded_for="203.0.113.10, 10.0.0.1",
    )

    assert resolve_client_ip(request) == "203.0.113.10"


def test_resolve_client_ip_supports_multiple_trusted_proxies(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.client_identity.get_settings",
        lambda: SimpleNamespace(TRUSTED_PROXY_DEPTH=2),
    )

    request = _build_request(
        client_host="10.0.0.2",
        forwarded_for="198.51.100.9, 10.0.0.1, 10.0.0.2",
    )

    assert resolve_client_ip(request) == "198.51.100.9"


def test_resolve_client_ip_falls_back_to_socket_peer_when_proxy_chain_is_shorter_than_expected(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.client_identity.get_settings",
        lambda: SimpleNamespace(TRUSTED_PROXY_DEPTH=3),
    )

    request = _build_request(
        client_host="10.0.0.9",
        forwarded_for="203.0.113.10, 10.0.0.1",
    )

    assert resolve_client_ip(request) == "10.0.0.9"


def test_rate_limiter_builds_memory_backend(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.rate_limiter.get_settings",
        lambda: SimpleNamespace(RATE_LIMIT_BACKEND="memory", REDIS_URL=None),
    )

    limiter = RateLimiter()

    assert isinstance(limiter._backend(), InMemoryRateLimiterBackend)


def test_redis_rate_limiter_backend_uses_stubbed_client(monkeypatch) -> None:
    class _FakeRedisClient:
        def __init__(self) -> None:
            self.calls: list[tuple] = []

        def eval(self, *args):
            self.calls.append(args)
            return [1, 0, 4]

    fake_client = _FakeRedisClient()

    class _FakeRedisFactory:
        @staticmethod
        def from_url(redis_url: str, decode_responses: bool = True):
            assert redis_url == "redis://rate-limit"
            assert decode_responses is True
            return fake_client

    fake_module = SimpleNamespace(Redis=_FakeRedisFactory)
    monkeypatch.setitem(sys.modules, "redis", fake_module)

    backend = RedisRateLimiterBackend("redis://rate-limit")
    decision = backend.check(key="auth_login:test", limit=5, window_seconds=60)

    assert decision.allowed is True
    assert decision.retry_after_seconds == 0
    assert decision.remaining == 4
    assert len(fake_client.calls) == 1


def test_rate_limiter_builds_redis_backend_when_configured(monkeypatch) -> None:
    class _FakeRedisFactory:
        @staticmethod
        def from_url(redis_url: str, decode_responses: bool = True):
            return SimpleNamespace(eval=lambda *args: [1, 0, 1])

    monkeypatch.setitem(sys.modules, "redis", SimpleNamespace(Redis=_FakeRedisFactory))
    monkeypatch.setattr(
        "app.core.rate_limiter.get_settings",
        lambda: SimpleNamespace(RATE_LIMIT_BACKEND="redis", REDIS_URL="redis://shared-rate-limit"),
    )

    limiter = RateLimiter()

    assert isinstance(limiter._backend(), RedisRateLimiterBackend)


def test_settings_require_redis_url_when_redis_backend_is_selected() -> None:
    with pytest.raises(RuntimeError, match="REDIS_URL must be configured"):
        Settings(
            DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sola",
            JWT_SECRET="test-secret",
            REFRESH_TOKEN_SECRET="refresh-secret",
            RATE_LIMIT_BACKEND="redis",
            REDIS_URL="",
            APP_TIMEZONE="Asia/Riyadh",
        ).validate_startup_settings()
