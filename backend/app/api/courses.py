
import logging

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_user_optional, get_db
from app.core.exceptions import NotFoundException
from app.core.request_context import get_request_id
from app.models.course import Course
from app.models.course_ingestion import CourseIngestion
from app.models.raw_course import RawCourse
from app.models.user import User
from app.schemas.course import (
    CourseCardResponse,
    CourseIngestRequest,
    CourseIngestResponse,
    CourseIngestionResponse,
    CourseSearchResponse,
    CourseSearchSortBy,
    RawCourseResponse,
)
from app.services.course_card_service import build_course_card, build_course_cards
from app.services.course_filtering_service import process_raw_courses
from app.services.course_ingestion_service import create_ingestion, save_raw_courses
from app.services.course_search_service import CourseSearchParams, search_courses
from app.services.discovery_personalization_service import (
    evaluate_course_discovery_fit,
    load_discovery_context,
)
from app.services.youtube_service import search_youtube_content

router = APIRouter(prefix="/courses", tags=["Courses"])
logger = logging.getLogger(__name__)


@router.post(
    "/ingest",
    response_model=CourseIngestResponse,
    status_code=status.HTTP_201_CREATED,
)
def ingest_courses(
    request: Request,
    payload: CourseIngestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ingestion = create_ingestion(
        db=db,
        user_id=current_user.id,
        source="youtube",
        query=payload.query,
        status="pending",
    )

    try:
        results = search_youtube_content(
            query=payload.query,
            max_results_per_type=payload.max_results_per_type,
        )

        save_raw_courses(
            db=db,
            ingestion_id=ingestion.id,
            raw_items=results,
        )

        promoted_courses = process_raw_courses(
            db=db,
            ingestion_id=ingestion.id,
        )

        ingestion.status = "success"
        db.commit()
        db.refresh(ingestion)

        return {
            "ingestion_id": ingestion.id,
            "total_raw_items": len(results),
            "total_promoted_courses": len(promoted_courses),
            "courses": build_course_cards(promoted_courses),
        }

    except Exception as error:
        logger.exception(
            "Course ingestion failed. request_id=%s ingestion_id=%s query=%s user_id=%s",
            getattr(request.state, "request_id", None) or get_request_id(),
            ingestion.id,
            payload.query,
            current_user.id,
        )

        db.rollback()

        failed_ingestion = (
            db.query(CourseIngestion)
            .filter(CourseIngestion.id == ingestion.id)
            .filter(CourseIngestion.user_id == current_user.id)
            .first()
        )

        if failed_ingestion:
            failed_ingestion.status = "failed"
            failed_ingestion.notes = str(error)
            db.commit()

        raise


@router.get(
    "/search",
    response_model=CourseSearchResponse,
    status_code=status.HTTP_200_OK,
)
def search_course_catalog(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    q: str | None = Query(default=None),
    language: str | None = Query(default=None),
    content_type: str | None = Query(default=None),
    source: str | None = Query(default=None),
    difficulty_level: str | None = Query(default=None),
    pricing_model: str | None = Query(default=None),
    progression_hint: str | None = Query(default=None),
    topic_tag: str | None = Query(default=None),
    sort_by: CourseSearchSortBy = Query(default="relevance"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return search_courses(
        db=db,
        current_user_id=current_user.id if current_user else None,
        params=CourseSearchParams(
            q=q,
            language=language,
            content_type=content_type,
            source=source,
            difficulty_level=difficulty_level,
            pricing_model=pricing_model,
            progression_hint=progression_hint,
            topic_tag=topic_tag,
            sort_by=sort_by,
            limit=limit,
            offset=offset,
        ),
    )


@router.get(
    "",
    response_model=list[CourseCardResponse],
    status_code=status.HTTP_200_OK,
)
def list_courses(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    q: str | None = Query(default=None),
    language: str | None = Query(default=None),
    content_type: str | None = Query(default=None),
    source: str | None = Query(default=None),
    difficulty_level: str | None = Query(default=None),
    pricing_model: str | None = Query(default=None),
    progression_hint: str | None = Query(default=None),
    topic_tag: str | None = Query(default=None),
    sort_by: CourseSearchSortBy = Query(default="quality"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    result = search_courses(
        db=db,
        current_user_id=current_user.id if current_user else None,
        params=CourseSearchParams(
            q=q,
            language=language,
            content_type=content_type,
            source=source,
            difficulty_level=difficulty_level,
            pricing_model=pricing_model,
            progression_hint=progression_hint,
            topic_tag=topic_tag,
            sort_by=sort_by,
            limit=limit,
            offset=offset,
        ),
    )
    return result["items"]


@router.get(
    "/ingestions",
    response_model=list[CourseIngestionResponse],
    status_code=status.HTTP_200_OK,
)
def list_course_ingestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status_filter: str | None = Query(default=None, alias="status"),
    source: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = db.query(CourseIngestion).filter(CourseIngestion.user_id == current_user.id)

    if status_filter:
        query = query.filter(CourseIngestion.status == status_filter)

    if source:
        query = query.filter(CourseIngestion.source == source)

    ingestions = (
        query.order_by(CourseIngestion.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return ingestions


@router.get(
    "/raw",
    response_model=list[RawCourseResponse],
    status_code=status.HTTP_200_OK,
)
def list_raw_courses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ingestion_id: int | None = Query(default=None),
    is_processed: bool | None = Query(default=None),
    is_accepted: bool | None = Query(default=None),
    language: str | None = Query(default=None),
    content_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = (
        db.query(RawCourse)
        .join(CourseIngestion, RawCourse.ingestion_id == CourseIngestion.id)
        .filter(CourseIngestion.user_id == current_user.id)
    )

    if ingestion_id is not None:
        owned_ingestion = (
            db.query(CourseIngestion)
            .filter(CourseIngestion.id == ingestion_id)
            .filter(CourseIngestion.user_id == current_user.id)
            .first()
        )
        if not owned_ingestion:
            raise NotFoundException("Course ingestion not found.")
        query = query.filter(RawCourse.ingestion_id == ingestion_id)

    if is_processed is not None:
        query = query.filter(RawCourse.is_processed == is_processed)

    if is_accepted is not None:
        query = query.filter(RawCourse.is_accepted == is_accepted)

    if language:
        query = query.filter(RawCourse.language == language)

    if content_type:
        query = query.filter(RawCourse.content_type == content_type)

    raw_courses = (
        query.order_by(RawCourse.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return raw_courses


@router.get(
    "/{course_id}",
    response_model=CourseCardResponse,
    status_code=status.HTTP_200_OK,
)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    course = db.query(Course).filter(Course.id == course_id).first()

    if not course:
        raise NotFoundException("Course not found.")

    personalization = None
    if current_user is not None:
        context = load_discovery_context(db=db, user_id=current_user.id)
        personalization = evaluate_course_discovery_fit(course=course, context=context).personalization

    return build_course_card(course=course, personalization=personalization)
