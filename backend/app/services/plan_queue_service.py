from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, NotFoundException
from app.models.schedule_queue_item import ScheduleQueueItem
from app.services.plan_shared import (
    get_course_by_id,
    get_schedule_queue_item,
    is_course_in_any_open_plan,
)


def add_course_to_schedule_queue(
    db: Session,
    user_id: int,
    course_id: int,
    note: str | None = None,
) -> ScheduleQueueItem:
    course = get_course_by_id(db=db, course_id=course_id)
    if not course:
        raise NotFoundException("Course not found.")

    existing_item = (
        db.query(ScheduleQueueItem)
        .filter(ScheduleQueueItem.user_id == user_id)
        .filter(ScheduleQueueItem.course_id == course_id)
        .first()
    )
    if existing_item:
        raise ConflictException("Course already exists in schedule queue.")

    if is_course_in_any_open_plan(db=db, user_id=user_id, course_id=course_id):
        raise ConflictException("Course already exists inside an open learning plan.")

    queue_item = ScheduleQueueItem(
        user_id=user_id,
        course_id=course_id,
        status="queued",
        note=note,
    )

    db.add(queue_item)
    db.commit()
    db.refresh(queue_item)

    return queue_item


def remove_course_from_schedule_queue(
    db: Session,
    user_id: int,
    queue_item_id: int,
) -> None:
    queue_item = get_schedule_queue_item(
        db=db,
        user_id=user_id,
        queue_item_id=queue_item_id,
    )
    if not queue_item:
        raise NotFoundException("Schedule queue item not found.")

    if queue_item.status == "scheduled":
        raise ConflictException("Cannot remove a queue item that is already inside an open learning plan.")

    db.delete(queue_item)
    db.commit()
