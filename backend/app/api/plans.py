from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_expected_version_header
from app.core.exceptions import NotFoundException
from app.models.user import User
from app.schemas.learning_plan import (
    LearningPlanCreateRequest,
    LearningPlanReadinessResponse,
    LearningPlanResponse,
    LearningPlanStatusUpdateRequest,
    SchedulingPreferenceResponse,
    SchedulingPreferenceUpdateRequest,
)
from app.schemas.schedule_queue import (
    ScheduleQueueAddRequest,
    ScheduleQueueItemResponse,
)
from app.services.plan_service import (
    add_course_to_schedule_queue,
    add_queue_item_to_open_plan,
    create_learning_plan,
    get_active_learning_plan,
    get_learning_plan_by_id,
    get_learning_plan_readiness,
    list_schedule_queue_items,
    list_user_learning_plans,
    remove_course_from_learning_plan,
    remove_course_from_schedule_queue,
    update_learning_plan_status,
    update_scheduling_preference,
)

router = APIRouter(prefix="/plans", tags=["Plans"])


@router.post(
    "/queue/{course_id}",
    response_model=ScheduleQueueItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_course_to_queue(
    course_id: int,
    payload: ScheduleQueueAddRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return add_course_to_schedule_queue(
        db=db,
        user_id=current_user.id,
        course_id=course_id,
        note=payload.note,
    )


@router.get(
    "/queue",
    response_model=list[ScheduleQueueItemResponse],
    status_code=status.HTTP_200_OK,
)
def read_schedule_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_schedule_queue_items(db=db, user_id=current_user.id)


@router.delete(
    "/queue/{queue_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_queue_item(
    queue_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    remove_course_from_schedule_queue(
        db=db,
        user_id=current_user.id,
        queue_item_id=queue_item_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "",
    response_model=LearningPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_plan(
    payload: LearningPlanCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_learning_plan(
        db=db,
        user_id=current_user.id,
        payload=payload,
    )


@router.get(
    "",
    response_model=list[LearningPlanResponse],
    status_code=status.HTTP_200_OK,
)
def read_all_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_user_learning_plans(db=db, user_id=current_user.id)


@router.get(
    "/active",
    response_model=LearningPlanResponse,
    status_code=status.HTTP_200_OK,
)
def read_active_plan(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = get_active_learning_plan(db=db, user_id=current_user.id)
    if not plan:
        raise NotFoundException("Active learning plan not found.")
    return plan


@router.get(
    "/{plan_id}",
    response_model=LearningPlanResponse,
    status_code=status.HTTP_200_OK,
)
def read_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = get_learning_plan_by_id(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
    )
    if not plan:
        raise NotFoundException("Learning plan not found.")
    return plan


@router.get(
    "/{plan_id}/readiness",
    response_model=LearningPlanReadinessResponse,
    status_code=status.HTTP_200_OK,
)
def read_plan_readiness(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_learning_plan_readiness(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
    )


@router.post(
    "/{plan_id}/courses/queue-items/{queue_item_id}",
    response_model=LearningPlanResponse,
    status_code=status.HTTP_200_OK,
)
def add_queue_item_into_plan(
    plan_id: int,
    queue_item_id: int,
    expected_version: int = Depends(get_expected_version_header),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return add_queue_item_to_open_plan(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        queue_item_id=queue_item_id,
        expected_version=expected_version,
    )


@router.delete(
    "/{plan_id}/courses/{plan_course_id}",
    response_model=LearningPlanResponse,
    status_code=status.HTTP_200_OK,
)
def delete_plan_course(
    plan_id: int,
    plan_course_id: int,
    expected_version: int = Depends(get_expected_version_header),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return remove_course_from_learning_plan(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        plan_course_id=plan_course_id,
        expected_version=expected_version,
    )


@router.put(
    "/{plan_id}/preferences",
    response_model=SchedulingPreferenceResponse,
    status_code=status.HTTP_200_OK,
)
def update_plan_preferences(
    plan_id: int,
    payload: SchedulingPreferenceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_scheduling_preference(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        payload=payload,
    )


@router.put(
    "/{plan_id}/status",
    response_model=LearningPlanResponse,
    status_code=status.HTTP_200_OK,
)
def update_plan_status(
    plan_id: int,
    payload: LearningPlanStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_learning_plan_status(
        db=db,
        user_id=current_user.id,
        plan_id=plan_id,
        payload=payload,
    )
