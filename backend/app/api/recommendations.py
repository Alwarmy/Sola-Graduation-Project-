from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.recommendation import RecommendationListResponse
from app.services.recommendation_service import get_personalized_recommendations

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.get(
    "",
    response_model=RecommendationListResponse,
    status_code=status.HTTP_200_OK,
)
def read_recommendations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=50),
):
    items = get_personalized_recommendations(
        db=db,
        user_id=current_user.id,
        limit=limit,
    )

    return {
        "total": len(items),
        "items": items,
    }
