from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any

import requests

BASE_URL = os.getenv("SOLA_BASE_URL", "http://127.0.0.1:8000")
TEST_PASSWORD = os.getenv("SOLA_VERIFICATION_PASSWORD", "12345678")
_VERIFICATION_NAMESPACE = os.getenv("SOLA_VERIFICATION_NAMESPACE", "default")
_CACHE_DIR = Path(__file__).resolve().parents[2] / "test_reports" / ".verification_cache"

_MAX_EMAIL_LOCAL_PART = 64
_EMAIL_DOMAIN = "example.com"
_EMAIL_PREFIX = "sola"
_SCOPE_SLUG_MAX_LENGTH = 18
_NAMESPACE_SLUG_MAX_LENGTH = 14
_CACHE_SCOPE_SLUG_MAX_LENGTH = 24
_CACHE_NAMESPACE_SLUG_MAX_LENGTH = 18


def _normalize_scope(scope: str) -> str:
    normalized = scope.strip().lower()
    normalized = normalized.replace("/", "_").replace("\\", "_").replace(" ", "_")
    normalized = re.sub(r"[^a-z0-9_]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized or "default"


def _short_slug(value: str, max_length: int) -> str:
    normalized = _normalize_scope(value)
    if len(normalized) <= max_length:
        return normalized
    return normalized[:max_length].rstrip("_") or normalized[:max_length]


def _stable_suffix(scope: str, namespace: str) -> str:
    raw = f"{scope}|{namespace}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:12]


def build_scoped_identity(scope: str, *, full_name: str | None = None) -> tuple[str, str]:
    normalized_scope = _normalize_scope(scope)
    normalized_namespace = _normalize_scope(_VERIFICATION_NAMESPACE)

    scope_slug = _short_slug(normalized_scope, _SCOPE_SLUG_MAX_LENGTH)
    namespace_slug = _short_slug(normalized_namespace, _NAMESPACE_SLUG_MAX_LENGTH)
    suffix = _stable_suffix(normalized_scope, normalized_namespace)

    local_part = f"{_EMAIL_PREFIX}.{scope_slug}.{namespace_slug}.{suffix}"

    assert len(local_part) <= _MAX_EMAIL_LOCAL_PART, (
        f"Verification email local part is too long: {local_part} ({len(local_part)} chars)"
    )

    email = f"{local_part}@{_EMAIL_DOMAIN}"
    resolved_full_name = full_name or f"SOLA Manual {scope_slug} {namespace_slug}"
    return email, resolved_full_name


def _cache_file(scope: str) -> Path:
    normalized_scope = _normalize_scope(scope)
    normalized_namespace = _normalize_scope(_VERIFICATION_NAMESPACE)
    scope_slug = _short_slug(normalized_scope, _CACHE_SCOPE_SLUG_MAX_LENGTH)
    namespace_slug = _short_slug(normalized_namespace, _CACHE_NAMESPACE_SLUG_MAX_LENGTH)
    suffix = _stable_suffix(normalized_scope, normalized_namespace)
    filename = f"{scope_slug}_{namespace_slug}_{suffix}.json"
    return _CACHE_DIR / filename


def get_cached_headers(scope: str) -> dict[str, str] | None:
    cache_path = _cache_file(scope)
    if not cache_path.exists():
        return None

    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        return None

    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        return None

    return {"Authorization": f"Bearer {access_token}"}


def cache_access_token(scope: str, access_token: str) -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = _cache_file(scope)
    cache_path.write_text(
        json.dumps({"access_token": access_token}, ensure_ascii=False),
        encoding="utf-8",
    )


def clear_cached_token(scope: str) -> None:
    cache_path = _cache_file(scope)
    if cache_path.exists():
        cache_path.unlink()


def assert_http_status(
    response: requests.Response,
    expected_status: int,
) -> dict[str, Any] | list[dict[str, Any]]:
    assert response.status_code == expected_status, (
        f"Expected status {expected_status}, got {response.status_code}: {response.text}"
    )
    if response.text:
        return response.json()
    return {}


def _validate_cached_headers(
    headers: dict[str, str],
    *,
    timeout: int,
) -> bool:
    try:
        response = requests.get(
            f"{BASE_URL}/auth/me",
            headers=headers,
            timeout=timeout,
        )
    except requests.RequestException:
        return False

    return response.status_code == 200


def get_shared_headers(
    scope: str,
    *,
    full_name: str | None = None,
    password: str = TEST_PASSWORD,
    timeout: int = 30,
) -> dict[str, str]:
    cached_headers = get_cached_headers(scope)
    if cached_headers is not None and _validate_cached_headers(cached_headers, timeout=timeout):
        return cached_headers

    if cached_headers is not None:
        clear_cached_token(scope)

    email, resolved_full_name = build_scoped_identity(scope, full_name=full_name)

    register_response = requests.post(
        f"{BASE_URL}/auth/register",
        json={
            "email": email,
            "full_name": resolved_full_name,
            "password": password,
        },
        timeout=timeout,
    )
    if register_response.status_code not in {201, 409}:
        raise AssertionError(
            f"Expected auth registration to return 201 or 409, got {register_response.status_code}: {register_response.text}"
        )

    if register_response.status_code == 409:
        payload = register_response.json()
        error_code = payload.get("error_code")
        assert error_code in {"user_already_exists", "conflict"}, (
            f"Unexpected duplicate registration payload: {payload}"
        )

    login_response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "email": email,
            "password": password,
        },
        timeout=timeout,
    )
    login_payload = assert_http_status(login_response, 200)
    assert isinstance(login_payload, dict)

    access_token = login_payload.get("access_token")
    assert isinstance(access_token, str) and access_token.strip(), (
        "Expected access_token from /auth/login"
    )

    cache_access_token(scope, access_token)
    return {"Authorization": f"Bearer {access_token}"}


def ensure_profile(
    headers: dict[str, str],
    payload: dict[str, Any],
    *,
    timeout: int = 60,
) -> dict[str, Any]:
    read_response = requests.get(
        f"{BASE_URL}/profile",
        headers=headers,
        timeout=timeout,
    )
    if read_response.status_code == 200:
        return read_response.json()

    if read_response.status_code != 404:
        raise AssertionError(
            f"Expected /profile read to return 200 or 404, got {read_response.status_code}: {read_response.text}"
        )

    create_response = requests.post(
        f"{BASE_URL}/profile",
        headers=headers,
        json=payload,
        timeout=timeout,
    )
    profile_payload = assert_http_status(create_response, 201)
    assert isinstance(profile_payload, dict)
    return profile_payload