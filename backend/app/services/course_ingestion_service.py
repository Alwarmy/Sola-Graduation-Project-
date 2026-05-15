from datetime import datetime

from sqlalchemy.orm import Session

from app.models.course_ingestion import CourseIngestion
from app.models.raw_course import RawCourse


def create_ingestion(
    db: Session,
    user_id: int,
    source: str,
    query: str,
    status: str = "pending",
    notes: str | None = None,
) -> CourseIngestion:
    ingestion = CourseIngestion(
        user_id=user_id,
        source=source,
        query=query,
        status=status,
        notes=notes,
    )

    db.add(ingestion)
    db.commit()
    db.refresh(ingestion)

    return ingestion


def parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def save_raw_courses(
    db: Session,
    ingestion_id: int,
    raw_items: list[dict],
) -> list[RawCourse]:
    saved_items: list[RawCourse] = []

    for item in raw_items:
        raw_course = RawCourse(
            ingestion_id=ingestion_id,
            source=item["source"],
            external_id=item["external_id"],
            content_type=item["content_type"],
            normalized_title=item.get("normalized_title"),
            channel_title=item.get("channel_title"),
            language=None,
            raw_data=item["raw_data"],
            is_processed=False,
            is_accepted=None,
            rejection_reason=None,
            published_at=parse_published_at(item.get("published_at")),
        )

        db.add(raw_course)
        saved_items.append(raw_course)

    db.commit()

    for raw_course in saved_items:
        db.refresh(raw_course)

    return saved_items