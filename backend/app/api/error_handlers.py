from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.exceptions import AppException
from app.core.request_context import REQUEST_ID_HEADER, get_request_id

logger = logging.getLogger(__name__)


def _build_error_payload(
    *,
    detail: str,
    error_code: str,
    request_id: str | None,
    details: dict | None = None,
) -> dict:
    payload = {
        "detail": detail,
        "error_code": error_code,
        "request_id": request_id,
    }

    if details:
        payload["details"] = details

    return payload


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None) or get_request_id()
        response_headers = dict(exc.headers)
        if request_id:
            response_headers[REQUEST_ID_HEADER] = request_id
        return JSONResponse(
            status_code=exc.status_code,
            content=_build_error_payload(
                detail=exc.message,
                error_code=exc.error_code,
                request_id=request_id,
                details=exc.details,
            ),
            headers=response_headers or {},
        )

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None) or get_request_id()
        response_headers = {REQUEST_ID_HEADER: request_id} if request_id else None
        return JSONResponse(
            status_code=422,
            content=_build_error_payload(
                detail="Request validation failed.",
                error_code="request_validation_error",
                request_id=request_id,
                details={"errors": exc.errors()},
            ),
            headers=response_headers or {},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None) or get_request_id()
        logger.exception(
            "Unhandled application error. request_id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
            exc_info=exc,
        )

        return JSONResponse(
            status_code=500,
            content=_build_error_payload(
                detail="Internal server error.",
                error_code="internal_server_error",
                request_id=request_id,
            ),
            headers={REQUEST_ID_HEADER: request_id} if request_id else {},
        )
