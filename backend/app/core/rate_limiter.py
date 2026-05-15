from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from math import ceil
from threading import Lock
from time import monotonic, time
from uuid import uuid4
from typing import Protocol

from app.core.config import get_settings
from app.core.exceptions import ConfigurationException


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int
    remaining: int


class RateLimiterBackend(Protocol):
    def reset(self) -> None:
        ...

    def check(self, *, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        ...


class InMemoryRateLimiterBackend:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = {}
        self._lock = Lock()

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()

    def check(self, *, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        if limit <= 0:
            raise ValueError("limit must be greater than zero.")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be greater than zero.")

        now = monotonic()

        with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            cutoff = now - window_seconds

            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                retry_after_seconds = max(1, ceil(window_seconds - (now - bucket[0])))
                return RateLimitDecision(
                    allowed=False,
                    retry_after_seconds=retry_after_seconds,
                    remaining=0,
                )

            bucket.append(now)
            remaining = max(0, limit - len(bucket))
            return RateLimitDecision(
                allowed=True,
                retry_after_seconds=0,
                remaining=remaining,
            )


class RedisRateLimiterBackend:
    _CHECK_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local cutoff = now - window_ms

redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
local current = redis.call('ZCARD', key)

if current >= limit then
    local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after_ms = window_ms
    if first[2] then
        retry_after_ms = math.max(1, window_ms - (now - tonumber(first[2])))
    end
    return {0, retry_after_ms, 0}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window_ms)
local new_count = redis.call('ZCARD', key)
return {1, 0, math.max(limit - new_count, 0)}
"""

    def __init__(self, redis_url: str) -> None:
        try:
            import redis
        except ModuleNotFoundError as exc:
            raise ConfigurationException(
                "Redis rate limiting is configured but the redis package is not installed.",
                error_code="redis_rate_limit_dependency_missing",
            ) from exc

        self._client = redis.Redis.from_url(redis_url, decode_responses=True)

    def reset(self) -> None:
        return None

    def check(self, *, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        if limit <= 0:
            raise ValueError("limit must be greater than zero.")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be greater than zero.")

        now_ms = int(time() * 1000)
        member = f"{now_ms}:{uuid4().hex}"
        result = self._client.eval(
            self._CHECK_SCRIPT,
            1,
            f"rate_limit:{key}",
            now_ms,
            int(window_seconds * 1000),
            limit,
            member,
        )

        allowed = bool(int(result[0]))
        retry_after_seconds = max(0, ceil(int(result[1]) / 1000))
        remaining = int(result[2])
        return RateLimitDecision(
            allowed=allowed,
            retry_after_seconds=retry_after_seconds,
            remaining=remaining,
        )


class RateLimiter:
    def __init__(self) -> None:
        self._backend_cache: RateLimiterBackend | None = None
        self._lock = Lock()

    def _build_backend(self) -> RateLimiterBackend:
        settings = get_settings()
        if settings.RATE_LIMIT_BACKEND == "memory":
            return InMemoryRateLimiterBackend()

        redis_url = (settings.REDIS_URL or "").strip()
        if not redis_url:
            raise ConfigurationException(
                "RATE_LIMIT_BACKEND is set to redis but REDIS_URL is not configured.",
                error_code="redis_rate_limit_not_configured",
            )
        return RedisRateLimiterBackend(redis_url)

    def _backend(self) -> RateLimiterBackend:
        with self._lock:
            if self._backend_cache is None:
                self._backend_cache = self._build_backend()
            return self._backend_cache

    def reset(self) -> None:
        with self._lock:
            if self._backend_cache is not None:
                self._backend_cache.reset()

    def reset_backend_cache(self) -> None:
        with self._lock:
            self._backend_cache = None

    def check(self, *, key: str, limit: int, window_seconds: int) -> RateLimitDecision:
        return self._backend().check(key=key, limit=limit, window_seconds=window_seconds)


rate_limiter = RateLimiter()
