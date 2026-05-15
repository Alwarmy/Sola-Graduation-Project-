from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.plan_recovery import (
    PlanRecoveryApplyRequest,
    PlanRecoveryApplyResponse,
    PlanRecoveryPreviewResponse,
)
from app.services.plan_recovery_service import (
    apply_plan_recovery,
    get_plan_recovery_preview,
)

router = APIRouter(prefix="/plans", tags=["Plan Recovery"])


@router.get(
    "/{plan_id}/recovery-preview",
    response_model=PlanRecoveryPreviewResponse,
    status_code=status.HTTP_200_OK,
)
def read_plan_recovery_preview(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_plan_recovery_preview(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
    )


@router.post(
    "/{plan_id}/recover",
    response_model=PlanRecoveryApplyResponse,
    status_code=status.HTTP_200_OK,
)
def recover_plan(
    plan_id: int,
    payload: PlanRecoveryApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return apply_plan_recovery(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        mode=payload.mode,
        expected_version=payload.expected_version,
        expected_schedule_revision=payload.expected_schedule_revision,
        preferred_time_window=payload.preferred_time_window,
        pace_mode=payload.pace_mode,
        preferred_study_days=payload.preferred_study_days,
        max_daily_minutes=payload.max_daily_minutes,
        session_cap_minutes=payload.session_cap_minutes,
        temporary_note=payload.temporary_note,
        recovery_note=payload.recovery_note,
    )
