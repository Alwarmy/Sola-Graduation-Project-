from __future__ import annotations

from fastapi import FastAPI, Request

from app.core.request_context import (
    REQUEST_ID_HEADER,
    clear_request_id,
    generate_request_id,
    set_request_id,
)


def _sanitize_request_id(raw_value: str | None) -> str:
    candidate = (raw_value or "").strip()
    if not candidate:
        return generate_request_id()

    if len(candidate) > 128:
        candidate = candidate[:128]

    return candidate


def register_request_context_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request_id = _sanitize_request_id(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id
        set_request_id(request_id)

        try:
            response = await call_next(request)
        finally:
            clear_request_id()

        response.headers[REQUEST_ID_HEADER] = request_id
        return response
