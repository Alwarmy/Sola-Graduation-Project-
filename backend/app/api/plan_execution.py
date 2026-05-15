from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_expected_version_header
from app.models.user import User
from app.schemas.learning_plan_item import (
    LearningPlanItemActionResultResponse,
    LearningPlanItemCompleteRequest,
    LearningPlanItemSkipRequest,
    PlanExecutionSummaryResponse,
)
from app.services.plan_execution_service import (
    complete_learning_plan_item,
    get_plan_execution_summary,
    skip_learning_plan_item,
    start_learning_plan_item,
)

router = APIRouter(prefix="/plans", tags=["Plan Execution"])


@router.get(
    "/{plan_id}/execution-summary",
    response_model=PlanExecutionSummaryResponse,
    status_code=status.HTTP_200_OK,
)
def read_plan_execution_summary(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_plan_execution_summary(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
    )


@router.post(
    "/{plan_id}/items/{item_id}/start",
    response_model=LearningPlanItemActionResultResponse,
    status_code=status.HTTP_200_OK,
)
def start_plan_item(
    plan_id: int,
    item_id: int,
    expected_version: int = Depends(get_expected_version_header),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return start_learning_plan_item(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        item_id=item_id,
        expected_version=expected_version,
    )


@router.post(
    "/{plan_id}/items/{item_id}/complete",
    response_model=LearningPlanItemActionResultResponse,
    status_code=status.HTTP_200_OK,
)
def complete_plan_item(
    plan_id: int,
    item_id: int,
    payload: LearningPlanItemCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return complete_learning_plan_item(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        item_id=item_id,
        actual_minutes=payload.actual_minutes,
        expected_version=payload.expected_version,
    )


@router.post(
    "/{plan_id}/items/{item_id}/skip",
    response_model=LearningPlanItemActionResultResponse,
    status_code=status.HTTP_200_OK,
)
def skip_plan_item(
    plan_id: int,
    item_id: int,
    payload: LearningPlanItemSkipRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return skip_learning_plan_item(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        item_id=item_id,
        skip_reason=payload.skip_reason,
        expected_version=payload.expected_version,
    )
