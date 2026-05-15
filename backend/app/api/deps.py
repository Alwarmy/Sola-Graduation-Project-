
from fastapi import Depends, Header
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.concurrency import EXPECTED_VERSION_HEADER
from app.core.exceptions import UnauthorizedException
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _resolve_user_from_token(token: str, db: Session) -> User:
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")

        if not subject:
            raise UnauthorizedException("Invalid authentication token.")

        try:
            user_id = int(subject)
        except (TypeError, ValueError):
            raise UnauthorizedException("Invalid authentication token.")

    except JWTError:
        raise UnauthorizedException("Invalid authentication token.")

    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise UnauthorizedException("Invalid authentication token.")

    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    return _resolve_user_from_token(token=token, db=db)


def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> User | None:
    if token is None:
        return None

    return _resolve_user_from_token(token=token, db=db)


def get_expected_version_header(
    expected_version: int = Header(..., alias=EXPECTED_VERSION_HEADER, ge=1),
) -> int:
    return expected_version
