from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedException
from app.core.security import (
    build_refresh_token_value,
    create_access_token,
    generate_refresh_token_id,
    generate_refresh_token_secret,
    generate_session_id,
    hash_refresh_token,
    parse_refresh_token,
    verify_refresh_token,
)
from app.models.auth_refresh_token import AuthRefreshToken
from app.models.user import User

SESSION_REVOCATION_REASON_LOGOUT = "logout"
SESSION_REVOCATION_REASON_REPLAY = "refresh_token_reuse_detected"
SESSION_REVOCATION_REASON_EXPIRED = "refresh_token_expired"


@dataclass(frozen=True)
class AuthSessionTokens:
    access_token: str
    token_type: str
    refresh_token: str
    access_token_expires_in_seconds: int
    refresh_token_expires_in_seconds: int
    session_id: str

    def to_dict(self) -> dict[str, str | int]:
        return {
            "access_token": self.access_token,
            "token_type": self.token_type,
            "refresh_token": self.refresh_token,
            "access_token_expires_in_seconds": self.access_token_expires_in_seconds,
            "refresh_token_expires_in_seconds": self.refresh_token_expires_in_seconds,
            "session_id": self.session_id,
        }


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_user_agent(user_agent: str | None) -> str | None:
    cleaned = (user_agent or "").strip()
    if not cleaned:
        return None
    return cleaned[:512]


def _refresh_expiry_delta() -> timedelta:
    settings = get_settings()
    return timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


def _serialize_tokens(
    *,
    user_id: int,
    session_id: str,
    refresh_token: str,
) -> AuthSessionTokens:
    settings = get_settings()
    return AuthSessionTokens(
        access_token=create_access_token(
            subject=str(user_id),
            extra_claims={"sid": session_id},
        ),
        token_type="bearer",
        refresh_token=refresh_token,
        access_token_expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        refresh_token_expires_in_seconds=int(_refresh_expiry_delta().total_seconds()),
        session_id=session_id,
    )


def _build_refresh_token_record(
    *,
    user_id: int,
    session_id: str,
    parent_token_id: int | None,
    client_ip: str | None,
    user_agent: str | None,
) -> tuple[str, AuthRefreshToken]:
    token_id = generate_refresh_token_id()
    token_secret = generate_refresh_token_secret()
    refresh_token = build_refresh_token_value(token_id=token_id, token_secret=token_secret)
    now = _now_utc()

    record = AuthRefreshToken(
        token_id=token_id,
        session_id=session_id,
        parent_token_id=parent_token_id,
        user_id=user_id,
        token_hash=hash_refresh_token(refresh_token),
        expires_at=now + _refresh_expiry_delta(),
        created_ip=client_ip,
        created_user_agent=_normalize_user_agent(user_agent),
    )
    return refresh_token, record


def revoke_refresh_token_session(
    db: Session,
    *,
    session_id: str,
    reason: str,
) -> None:
    now = _now_utc()
    session_tokens = (
        db.query(AuthRefreshToken)
        .filter(AuthRefreshToken.session_id == session_id)
        .all()
    )

    for token in session_tokens:
        if token.revoked_at is None:
            token.revoked_at = now
        if token.revocation_reason is None:
            token.revocation_reason = reason


def issue_user_session(
    db: Session,
    *,
    user: User,
    client_ip: str | None,
    user_agent: str | None,
) -> AuthSessionTokens:
    session_id = generate_session_id()
    refresh_token, refresh_record = _build_refresh_token_record(
        user_id=user.id,
        session_id=session_id,
        parent_token_id=None,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    db.add(refresh_record)
    db.commit()

    return _serialize_tokens(
        user_id=user.id,
        session_id=session_id,
        refresh_token=refresh_token,
    )


def _resolve_refresh_token_record(
    db: Session,
    *,
    refresh_token: str,
) -> tuple[AuthRefreshToken, str]:
    parsed_token = parse_refresh_token(refresh_token)
    if not parsed_token:
        raise UnauthorizedException(
            "Refresh token is invalid.",
            error_code="invalid_refresh_token",
        )

    token_id, _token_secret = parsed_token
    refresh_record = (
        db.query(AuthRefreshToken)
        .filter(AuthRefreshToken.token_id == token_id)
        .first()
    )
    if not refresh_record:
        raise UnauthorizedException(
            "Refresh token is invalid.",
            error_code="invalid_refresh_token",
        )

    if not verify_refresh_token(token=refresh_token, token_hash=refresh_record.token_hash):
        raise UnauthorizedException(
            "Refresh token is invalid.",
            error_code="invalid_refresh_token",
        )

    return refresh_record, token_id


def _raise_for_inactive_refresh_token(refresh_record: AuthRefreshToken) -> None:
    if refresh_record.revocation_reason == SESSION_REVOCATION_REASON_LOGOUT:
        raise UnauthorizedException(
            "Refresh token has been revoked.",
            error_code="refresh_token_revoked",
        )
    if refresh_record.revocation_reason == SESSION_REVOCATION_REASON_EXPIRED:
        raise UnauthorizedException(
            "Refresh token has expired.",
            error_code="refresh_token_expired",
        )

    raise UnauthorizedException(
        "Refresh token is no longer valid.",
        error_code="refresh_token_reused",
    )


def refresh_user_session(
    db: Session,
    *,
    refresh_token: str,
    client_ip: str | None,
    user_agent: str | None,
) -> AuthSessionTokens:
    refresh_record, _token_id = _resolve_refresh_token_record(
        db=db,
        refresh_token=refresh_token,
    )
    now = _now_utc()

    if refresh_record.expires_at <= now:
        revoke_refresh_token_session(
            db=db,
            session_id=refresh_record.session_id,
            reason=SESSION_REVOCATION_REASON_EXPIRED,
        )
        db.commit()
        raise UnauthorizedException(
            "Refresh token has expired.",
            error_code="refresh_token_expired",
        )

    if refresh_record.revoked_at is not None:
        _raise_for_inactive_refresh_token(refresh_record)

    if refresh_record.rotated_at is not None:
        revoke_refresh_token_session(
            db=db,
            session_id=refresh_record.session_id,
            reason=SESSION_REVOCATION_REASON_REPLAY,
        )
        db.commit()
        raise UnauthorizedException(
            "Refresh token is no longer valid.",
            error_code="refresh_token_reused",
        )

    rotation_applied = (
        db.query(AuthRefreshToken)
        .filter(AuthRefreshToken.id == refresh_record.id)
        .filter(AuthRefreshToken.revoked_at.is_(None))
        .filter(AuthRefreshToken.rotated_at.is_(None))
        .update(
            {
                AuthRefreshToken.last_used_at: now,
                AuthRefreshToken.rotated_at: now,
            },
            synchronize_session=False,
        )
    )
    if rotation_applied != 1:
        db.expire_all()
        revoke_refresh_token_session(
            db=db,
            session_id=refresh_record.session_id,
            reason=SESSION_REVOCATION_REASON_REPLAY,
        )
        db.commit()
        raise UnauthorizedException(
            "Refresh token is no longer valid.",
            error_code="refresh_token_reused",
        )

    next_refresh_token, next_refresh_record = _build_refresh_token_record(
        user_id=refresh_record.user_id,
        session_id=refresh_record.session_id,
        parent_token_id=refresh_record.id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    db.add(next_refresh_record)
    db.commit()

    return _serialize_tokens(
        user_id=refresh_record.user_id,
        session_id=refresh_record.session_id,
        refresh_token=next_refresh_token,
    )


def logout_user_session(
    db: Session,
    *,
    refresh_token: str,
) -> None:
    refresh_record, _token_id = _resolve_refresh_token_record(
        db=db,
        refresh_token=refresh_token,
    )

    revoke_refresh_token_session(
        db=db,
        session_id=refresh_record.session_id,
        reason=SESSION_REVOCATION_REASON_LOGOUT,
    )
    db.commit()
