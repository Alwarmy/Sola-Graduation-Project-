from __future__ import annotations

from contextvars import ContextVar
from uuid import uuid4

REQUEST_ID_HEADER = "X-Request-ID"

_request_id_context: ContextVar[str | None] = ContextVar("request_id", default=None)


def generate_request_id() -> str:
    return uuid4().hex


def set_request_id(request_id: str) -> None:
    _request_id_context.set(request_id)


def get_request_id() -> str | None:
    return _request_id_context.get()


def clear_request_id() -> None:
    _request_id_context.set(None)
