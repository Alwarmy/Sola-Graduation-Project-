from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.user_event import UserEventCreate, UserEventResponse
from app.services.user_event_service import create_user_event, list_user_events

router = APIRouter(prefix="/events", tags=["User Events"])


@router.post(
    "",
    response_model=UserEventResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    payload: UserEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_user_event(
        db=db,
        user_id=current_user.id,
        payload=payload,
    )


@router.get(
    "",
    response_model=list[UserEventResponse],
    status_code=status.HTTP_200_OK,
)
def read_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return list_user_events(
        db=db,
        user_id=current_user.id,
        event_type=event_type,
        limit=limit,
        offset=offset,
    )
