from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.exceptions import NotFoundException
from app.models.user import User
from app.schemas.user_learning_state import UserLearningStateResponse
from app.services.user_learning_state_service import (
    get_user_learning_state,
    refresh_user_learning_state,
)

router = APIRouter(prefix="/learning-state", tags=["User Learning State"])


@router.post(
    "/refresh",
    response_model=UserLearningStateResponse,
    status_code=status.HTTP_200_OK,
)
def refresh_learning_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return refresh_user_learning_state(
        db=db,
        user_id=current_user.id,
    )


@router.get(
    "",
    response_model=UserLearningStateResponse,
    status_code=status.HTTP_200_OK,
)
def read_learning_state(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    learning_state = get_user_learning_state(
        db=db,
        user_id=current_user.id,
    )

    if not learning_state:
        raise NotFoundException("User learning state not found.")

    return learning_state
