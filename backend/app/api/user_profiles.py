from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.exceptions import NotFoundException
from app.models.user import User
from app.schemas.user_profile import (
    UserProfileCreate,
    UserProfileResponse,
    UserProfileUpdate,
)
from app.services.user_profile_service import (
    create_user_profile,
    get_user_profile,
    update_user_profile,
)

router = APIRouter(prefix="/profile", tags=["User Profile"])


@router.post(
    "",
    response_model=UserProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_profile(
    payload: UserProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_user_profile(
        db=db,
        user_id=current_user.id,
        payload=payload,
    )


@router.get(
    "",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
)
def read_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = get_user_profile(db=db, user_id=current_user.id)

    if not profile:
        raise NotFoundException("User profile not found.")

    return profile


@router.put(
    "",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
)
def update_profile(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_user_profile(
        db=db,
        user_id=current_user.id,
        payload=payload,
    )
