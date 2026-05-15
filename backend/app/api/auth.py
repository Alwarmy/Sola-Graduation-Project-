import logging

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.client_identity import resolve_client_ip
from app.core.config import get_settings
from app.core.exceptions import RateLimitException, UnauthorizedException
from app.core.rate_limiter import rate_limiter
from app.core.request_context import get_request_id
from app.models.user import User
from app.schemas.auth import LogoutRequest, RefreshTokenRequest, Token, UserLogin, UserRegister
from app.schemas.user import UserResponse
from app.services.auth_service import login_user, normalize_email, register_user
from app.services.auth_session_service import (
    issue_user_session,
    logout_user_session,
    refresh_user_session,
)
from app.core.security import parse_refresh_token

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger(__name__)


def _enforce_rate_limit(
    *,
    request: Request,
    route_name: str,
    identifier: str,
    ip_limit: int,
    identifier_limit: int,
    window_seconds: int,
) -> None:
    client_ip = resolve_client_ip(request)
    request_id = getattr(request.state, "request_id", None) or get_request_id()

    checks = [
        (
            f"{route_name}:ip:{client_ip}",
            ip_limit,
            f"{route_name}_ip",
            client_ip,
        ),
        (
            f"{route_name}:identifier:{identifier}",
            identifier_limit,
            f"{route_name}_identifier",
            identifier,
        ),
    ]

    for key, limit, scope, observed_value in checks:
        decision = rate_limiter.check(
            key=key,
            limit=limit,
            window_seconds=window_seconds,
        )
        if decision.allowed:
            continue

        logger.warning(
            "Auth rate limit exceeded. request_id=%s route=%s scope=%s client_ip=%s identifier=%s retry_after_seconds=%s",
            request_id,
            route_name,
            scope,
            client_ip,
            identifier,
            decision.retry_after_seconds,
        )
        raise RateLimitException(
            "Too many authentication attempts. Please try again later.",
            error_code="auth_rate_limited",
            details={
                "scope": scope,
                "key": observed_value,
                "retry_after_seconds": decision.retry_after_seconds,
            },
            headers={"Retry-After": str(decision.retry_after_seconds)},
        )


def _enforce_register_limits(request: Request, email: str) -> None:
    settings = get_settings()
    _enforce_rate_limit(
        request=request,
        route_name="auth_register",
        identifier=normalize_email(email),
        ip_limit=settings.AUTH_REGISTER_ATTEMPTS_PER_IP,
        identifier_limit=settings.AUTH_REGISTER_ATTEMPTS_PER_IDENTIFIER,
        window_seconds=settings.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )


def _enforce_login_limits(request: Request, email: str) -> None:
    settings = get_settings()
    _enforce_rate_limit(
        request=request,
        route_name="auth_login",
        identifier=normalize_email(email),
        ip_limit=settings.AUTH_LOGIN_ATTEMPTS_PER_IP,
        identifier_limit=settings.AUTH_LOGIN_ATTEMPTS_PER_IDENTIFIER,
        window_seconds=settings.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    request: Request,
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    _enforce_register_limits(request, user_data.email)
    user = register_user(db, user_data)
    return user


@router.post(
    "/login",
    response_model=Token,
    status_code=status.HTTP_200_OK,
)
def login(
    request: Request,
    user_data: UserLogin,
    db: Session = Depends(get_db),
):
    _enforce_login_limits(request, user_data.email)
    try:
        user = login_user(db, user_data)
    except UnauthorizedException:
        logger.warning(
            "Authentication failed. request_id=%s client_ip=%s email=%s",
            getattr(request.state, "request_id", None) or get_request_id(),
            resolve_client_ip(request),
            normalize_email(user_data.email),
        )
        raise

    tokens = issue_user_session(
        db=db,
        user=user,
        client_ip=resolve_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    return tokens.to_dict()


def _resolve_refresh_identifier(refresh_token: str) -> str:
    parsed_token = parse_refresh_token(refresh_token)
    if not parsed_token:
        return "malformed"
    token_id, _token_secret = parsed_token
    return token_id


def _enforce_refresh_limits(request: Request, refresh_token: str) -> None:
    settings = get_settings()
    _enforce_rate_limit(
        request=request,
        route_name="auth_refresh",
        identifier=_resolve_refresh_identifier(refresh_token),
        ip_limit=settings.AUTH_REFRESH_ATTEMPTS_PER_IP,
        identifier_limit=settings.AUTH_REFRESH_ATTEMPTS_PER_IDENTIFIER,
        window_seconds=settings.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
)
def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.post(
    "/refresh",
    response_model=Token,
    status_code=status.HTTP_200_OK,
)
def refresh(
    request: Request,
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    _enforce_refresh_limits(request, payload.refresh_token)

    try:
        tokens = refresh_user_session(
            db=db,
            refresh_token=payload.refresh_token,
            client_ip=resolve_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    except UnauthorizedException:
        logger.warning(
            "Refresh token exchange failed. request_id=%s client_ip=%s token_id=%s",
            getattr(request.state, "request_id", None) or get_request_id(),
            resolve_client_ip(request),
            _resolve_refresh_identifier(payload.refresh_token),
        )
        raise

    return tokens.to_dict()


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
)
def logout(
    payload: LogoutRequest,
    db: Session = Depends(get_db),
):
    logout_user_session(
        db=db,
        refresh_token=payload.refresh_token,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
