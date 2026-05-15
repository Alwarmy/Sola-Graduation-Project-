from __future__ import annotations

from http import HTTPStatus


class AppException(Exception):
    default_status_code = HTTPStatus.INTERNAL_SERVER_ERROR
    default_error_code = "app_error"

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: str | None = None,
        details: dict | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = int(status_code or self.default_status_code)
        self.error_code = error_code or self.default_error_code
        self.details = details or {}
        self.headers = headers or {}


class ValidationException(AppException):
    default_status_code = HTTPStatus.BAD_REQUEST
    default_error_code = "validation_error"


class NotFoundException(AppException):
    default_status_code = HTTPStatus.NOT_FOUND
    default_error_code = "not_found"


class ConflictException(AppException):
    default_status_code = HTTPStatus.CONFLICT
    default_error_code = "conflict"


class PreconditionFailedException(AppException):
    default_status_code = HTTPStatus.PRECONDITION_FAILED
    default_error_code = "precondition_failed"


class UnauthorizedException(AppException):
    default_status_code = HTTPStatus.UNAUTHORIZED
    default_error_code = "unauthorized"


class ForbiddenException(AppException):
    default_status_code = HTTPStatus.FORBIDDEN
    default_error_code = "forbidden"


class ExternalServiceException(AppException):
    default_status_code = HTTPStatus.BAD_GATEWAY
    default_error_code = "external_service_error"


class ConfigurationException(AppException):
    default_status_code = HTTPStatus.INTERNAL_SERVER_ERROR
    default_error_code = "configuration_error"


class RateLimitException(AppException):
    default_status_code = HTTPStatus.TOO_MANY_REQUESTS
    default_error_code = "rate_limited"
