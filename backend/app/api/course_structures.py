from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.exceptions import NotFoundException
from app.models.user import User
from app.schemas.course_structure import CourseStructureResponse, CourseUnitResponse
from app.services.course_structure_service import (
    build_course_structure,
    get_course_structure_by_course_id,
    list_course_units,
)

router = APIRouter(prefix="/course-structures", tags=["Course Structures"])


@router.post(
    "/{course_id}/build",
    response_model=CourseStructureResponse,
    status_code=status.HTTP_200_OK,
)
def build_structure(
    course_id: int,
    force_rebuild: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user

    return build_course_structure(
        db=db,
        course_id=course_id,
        force_rebuild=force_rebuild,
    )


@router.get(
    "/{course_id}",
    response_model=CourseStructureResponse,
    status_code=status.HTTP_200_OK,
)
def read_structure(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user

    structure = get_course_structure_by_course_id(db=db, course_id=course_id)
    if not structure:
        raise NotFoundException("Course structure not found.")

    return structure


@router.get(
    "/{course_id}/units",
    response_model=list[CourseUnitResponse],
    status_code=status.HTTP_200_OK,
)
def read_structure_units(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    del current_user

    return list_course_units(db=db, course_id=course_id)
