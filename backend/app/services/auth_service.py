from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, UnauthorizedException, ValidationException
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.schemas.auth import UserLogin, UserRegister


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_full_name(full_name: str) -> str:
    return " ".join(full_name.strip().split())


def get_user_by_email(db: Session, email: str) -> User | None:
    normalized_email = normalize_email(email)
    return db.query(User).filter(User.email == normalized_email).first()


def register_user(db: Session, user_data: UserRegister) -> User:
    normalized_email = normalize_email(user_data.email)
    normalized_full_name = normalize_full_name(user_data.full_name)

    if not normalized_full_name:
        raise ValidationException(
            "Full name is required.",
            error_code="full_name_required",
        )

    existing_user = get_user_by_email(db, normalized_email)
    if existing_user:
        raise ConflictException(
            "A user with this email already exists.",
            error_code="user_already_exists",
        )

    user = User(
        email=normalized_email,
        full_name=normalized_full_name,
        hashed_password=hash_password(user_data.password),
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def authenticate_user(db: Session, login_data: UserLogin) -> User | None:
    normalized_email = normalize_email(login_data.email)
    user = get_user_by_email(db, normalized_email)

    if not user:
        return None

    if not verify_password(login_data.password, user.hashed_password):
        return None

    return user


def login_user(db: Session, login_data: UserLogin) -> User:
    user = authenticate_user(db, login_data)

    if not user:
        raise UnauthorizedException(
            "Invalid email or password.",
            error_code="invalid_credentials",
        )

    return user
