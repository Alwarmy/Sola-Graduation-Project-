from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.learning_plan_item import (
    LearningPlanItemResponse,
    PlanScheduleGenerateRequest,
    PlanScheduleGenerateResponse,
)
from app.services.plan_execution_service import list_plan_items_with_execution_state
from app.services.plan_schedule_service import (
    generate_initial_plan_schedule,
    get_plan_schedule_summary,
)

router = APIRouter(prefix="/plans", tags=["Plan Schedule"])


@router.post(
    "/{plan_id}/schedule/generate",
    response_model=PlanScheduleGenerateResponse,
    status_code=status.HTTP_200_OK,
)
def generate_plan_schedule(
    plan_id: int,
    payload: PlanScheduleGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = generate_initial_plan_schedule(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        force_rebuild=payload.force_rebuild,
        expected_version=payload.expected_version,
        expected_schedule_revision=payload.expected_schedule_revision,
    )
    return get_plan_schedule_summary(
        db=db,
        user_id=current_user.id,
        plan_id=plan.id,
    )


@router.get(
    "/{plan_id}/items",
    response_model=list[LearningPlanItemResponse],
    status_code=status.HTTP_200_OK,
)
def read_plan_items(
    plan_id: int,
    status_filter: str | None = Query(default=None),
    actionable_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_plan_items_with_execution_state(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        status_filter=status_filter,
        actionable_only=actionable_only,
    )
