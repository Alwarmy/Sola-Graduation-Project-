import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

password_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, extra_claims: dict | None = None) -> str:
    settings = get_settings()

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": subject,
        "exp": expire,
    }

    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(
        payload,
        settings.jwt_secret_required(),
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    settings = get_settings()

    return jwt.decode(
        token,
        settings.jwt_secret_required(),
        algorithms=[settings.JWT_ALGORITHM],
    )


def generate_session_id() -> str:
    return uuid4().hex


def generate_refresh_token_id() -> str:
    return uuid4().hex


def generate_refresh_token_secret() -> str:
    return secrets.token_urlsafe(32)


def build_refresh_token_value(*, token_id: str, token_secret: str) -> str:
    return f"{token_id}.{token_secret}"


def parse_refresh_token(token: str) -> tuple[str, str] | None:
    token_id, separator, token_secret = token.strip().partition(".")
    if not separator or not token_id or not token_secret:
        return None
    return token_id, token_secret


def hash_refresh_token(token: str) -> str:
    settings = get_settings()
    digest = hmac.new(
        settings.refresh_token_secret_required().encode("utf-8"),
        token.encode("utf-8"),
        hashlib.sha256,
    )
    return digest.hexdigest()


def verify_refresh_token(*, token: str, token_hash: str) -> bool:
    candidate_hash = hash_refresh_token(token)
    return hmac.compare_digest(candidate_hash, token_hash)
