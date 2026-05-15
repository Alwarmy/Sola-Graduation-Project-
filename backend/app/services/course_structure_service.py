import logging
import math
import re
from datetime import UTC, datetime

import requests
from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    AppException,
    ConfigurationException,
    ExternalServiceException,
    NotFoundException,
    ValidationException,
)
from app.core.config import settings
from app.models.course import Course
from app.models.course_structure import CourseStructure
from app.models.course_unit import CourseUnit

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3"
YOUTUBE_MAX_RESULTS = 50
VIDEO_SESSION_CAP_MINUTES = 45
VIDEO_SESSION_CAP_SECONDS = VIDEO_SESSION_CAP_MINUTES * 60

PRACTICAL_KEYWORDS = {
    "build",
    "project",
    "hands-on",
    "lab",
    "coding",
    "implementation",
    "exercise",
    "workshop",
    "practical",
    "demo",
}
THEORETICAL_KEYWORDS = {
    "introduction",
    "overview",
    "theory",
    "concept",
    "concepts",
    "fundamentals",
    "basics",
    "foundation",
    "intro",
}
HEAVY_KEYWORDS = {
    "advanced",
    "deep",
    "architecture",
    "system",
    "optimization",
    "deployment",
    "production",
    "capstone",
}


def get_course_by_id(db: Session, course_id: int) -> Course | None:
    return db.query(Course).filter(Course.id == course_id).first()


def get_course_structure_by_course_id(
    db: Session,
    course_id: int,
) -> CourseStructure | None:
    return (
        db.query(CourseStructure)
        .options(
            selectinload(CourseStructure.course),
            selectinload(CourseStructure.units),
        )
        .filter(CourseStructure.course_id == course_id)
        .first()
    )


def list_course_units(db: Session, course_id: int) -> list[CourseUnit]:
    structure = get_course_structure_by_course_id(db=db, course_id=course_id)
    if not structure:
        raise NotFoundException("Course structure not found.")
    return structure.units


def _get_youtube_api_key() -> str:
    api_key = getattr(settings, "YOUTUBE_API_KEY", None)
    if not api_key:
        raise ConfigurationException(
            "YouTube provider is not configured.",
            error_code="youtube_provider_not_configured",
        )
    return api_key


def _youtube_get(endpoint: str, params: dict) -> dict:
    api_key = _get_youtube_api_key()
    request_params = {**params, "key": api_key}

    try:
        response = requests.get(
            f"{YOUTUBE_API_BASE_URL}/{endpoint}",
            params=request_params,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        raise ExternalServiceException(
            "YouTube provider request failed.",
            error_code="youtube_provider_request_failed",
            details={"provider": "youtube", "endpoint": endpoint},
        ) from exc


def _parse_iso8601_duration_to_seconds(duration: str) -> int:
    pattern = re.compile(
        r"PT"
        r"(?:(?P<hours>\d+)H)?"
        r"(?:(?P<minutes>\d+)M)?"
        r"(?:(?P<seconds>\d+)S)?"
    )
    match = pattern.fullmatch(duration)
    if not match:
        return 0

    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)

    return hours * 3600 + minutes * 60 + seconds


def _estimate_minutes_from_seconds(seconds: int) -> int:
    if seconds <= 0:
        return 1
    return max(1, math.ceil(seconds / 60))


def _classify_practical_signal(title: str) -> str:
    lowered = title.lower()

    practical_hits = sum(keyword in lowered for keyword in PRACTICAL_KEYWORDS)
    theoretical_hits = sum(keyword in lowered for keyword in THEORETICAL_KEYWORDS)

    if practical_hits > theoretical_hits:
        return "practical"
    if theoretical_hits > practical_hits:
        return "theoretical"
    return "mixed"


def _classify_load_signal(title: str, estimated_minutes: int) -> str:
    lowered = title.lower()

    if estimated_minutes >= 40 or any(keyword in lowered for keyword in HEAVY_KEYWORDS):
        return "heavy"
    if estimated_minutes <= 15:
        return "light"
    return "medium"


def _detect_structure_type(course: Course) -> str:
    if course.content_type == "playlist":
        return "playlist"
    if course.content_type == "video":
        return "single_video"
    raise ValidationException("Unsupported course content type for structure extraction.")


def _fetch_youtube_playlist_items(playlist_id: str) -> list[dict]:
    items: list[dict] = []
    page_token: str | None = None

    while True:
        params = {
            "part": "snippet,contentDetails",
            "playlistId": playlist_id,
            "maxResults": YOUTUBE_MAX_RESULTS,
        }
        if page_token:
            params["pageToken"] = page_token

        data = _youtube_get("playlistItems", params)

        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            content_details = item.get("contentDetails", {})

            video_id = content_details.get("videoId")
            title = snippet.get("title") or "Untitled lesson"
            description = snippet.get("description")
            position = snippet.get("position")

            if not video_id:
                continue

            items.append(
                {
                    "video_id": video_id,
                    "title": title,
                    "description": description,
                    "position": position,
                }
            )

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return items


def _fetch_youtube_video_details(video_ids: list[str]) -> dict[str, dict]:
    details: dict[str, dict] = {}

    for start in range(0, len(video_ids), YOUTUBE_MAX_RESULTS):
        batch = video_ids[start : start + YOUTUBE_MAX_RESULTS]
        data = _youtube_get(
            "videos",
            {
                "part": "contentDetails,snippet",
                "id": ",".join(batch),
                "maxResults": YOUTUBE_MAX_RESULTS,
            },
        )

        for item in data.get("items", []):
            video_id = item.get("id")
            content_details = item.get("contentDetails", {})
            snippet = item.get("snippet", {})

            details[video_id] = {
                "duration_seconds": _parse_iso8601_duration_to_seconds(
                    content_details.get("duration", "PT0S")
                ),
                "title": snippet.get("title"),
                "description": snippet.get("description"),
            }

    return details


def _build_playlist_units(course: Course) -> tuple[list[CourseUnit], dict]:
    playlist_items = _fetch_youtube_playlist_items(course.external_id)
    if not playlist_items:
        raise ValidationException("Playlist structure could not be extracted.")

    video_ids = [item["video_id"] for item in playlist_items]
    video_details = _fetch_youtube_video_details(video_ids)

    units: list[CourseUnit] = []
    skipped_video_count = 0

    for index, item in enumerate(playlist_items, start=1):
        detail = video_details.get(item["video_id"])
        if not detail:
            skipped_video_count += 1
            continue

        raw_duration_seconds = detail["duration_seconds"]
        estimated_minutes = _estimate_minutes_from_seconds(raw_duration_seconds)

        title = item["title"] or detail.get("title") or f"Lesson {index}"
        description = item.get("description") or detail.get("description")

        practical_signal = _classify_practical_signal(title)
        load_signal = _classify_load_signal(title, estimated_minutes)

        unit = CourseUnit(
            external_unit_id=item["video_id"],
            unit_type="playlist_video",
            title=title,
            description=description,
            source_order_index=index,
            raw_duration_seconds=raw_duration_seconds,
            estimated_minutes=estimated_minutes,
            start_second=None,
            end_second=None,
            practical_signal=practical_signal,
            load_signal=load_signal,
            source_metadata={
                "youtube_video_id": item["video_id"],
                "playlist_position": item.get("position"),
            },
        )
        units.append(unit)

    if not units:
        raise ValidationException("Playlist structure produced no valid units.")

    metadata = {
        "source_type": "playlist",
        "playlist_id": course.external_id,
        "raw_playlist_item_count": len(playlist_items),
        "skipped_video_count": skipped_video_count,
        "session_cap_minutes": VIDEO_SESSION_CAP_MINUTES,
    }

    return units, metadata


def _build_single_video_units(course: Course) -> tuple[list[CourseUnit], dict]:
    video_details = _fetch_youtube_video_details([course.external_id])
    detail = video_details.get(course.external_id)

    if not detail:
        raise ValidationException("Video structure could not be extracted.")

    total_seconds = detail["duration_seconds"]
    if total_seconds <= 0:
        raise ValidationException("Video duration is missing or invalid.")

    units: list[CourseUnit] = []
    chunk_count = math.ceil(total_seconds / VIDEO_SESSION_CAP_SECONDS)

    for index in range(chunk_count):
        start_second = index * VIDEO_SESSION_CAP_SECONDS
        end_second = min(total_seconds, (index + 1) * VIDEO_SESSION_CAP_SECONDS)
        chunk_seconds = end_second - start_second
        estimated_minutes = _estimate_minutes_from_seconds(chunk_seconds)

        if chunk_count == 1:
            title = course.title
        else:
            title = f"{course.title} - Part {index + 1}"

        practical_signal = _classify_practical_signal(course.title)
        load_signal = _classify_load_signal(title, estimated_minutes)

        unit = CourseUnit(
            external_unit_id=course.external_id,
            unit_type="video_chunk",
            title=title,
            description=detail.get("description"),
            source_order_index=index + 1,
            raw_duration_seconds=chunk_seconds,
            estimated_minutes=estimated_minutes,
            start_second=start_second,
            end_second=end_second,
            practical_signal=practical_signal,
            load_signal=load_signal,
            source_metadata={
                "youtube_video_id": course.external_id,
                "chunk_index": index + 1,
                "chunk_count": chunk_count,
            },
        )
        units.append(unit)

    metadata = {
        "source_type": "single_video",
        "youtube_video_id": course.external_id,
        "raw_video_duration_seconds": total_seconds,
        "chunk_count": chunk_count,
        "session_cap_minutes": VIDEO_SESSION_CAP_MINUTES,
    }

    return units, metadata


def _prepare_structure_units(course: Course) -> tuple[str, list[CourseUnit], dict]:
    structure_type = _detect_structure_type(course)

    if course.source != "youtube":
        raise ValidationException("Only YouTube courses are supported for structure extraction right now.")

    if structure_type == "playlist":
        units, metadata = _build_playlist_units(course)
        return structure_type, units, metadata

    if structure_type == "single_video":
        units, metadata = _build_single_video_units(course)
        return structure_type, units, metadata

    raise ValidationException("Unsupported structure type.")


def _resolve_existing_unit_minutes(unit: CourseUnit) -> int:
    if unit.estimated_minutes is not None:
        return max(int(unit.estimated_minutes), 0)

    if unit.raw_duration_seconds is not None:
        return _estimate_minutes_from_seconds(int(unit.raw_duration_seconds))

    if unit.start_second is not None and unit.end_second is not None:
        return _estimate_minutes_from_seconds(max(int(unit.end_second) - int(unit.start_second), 0))

    return 0


def _structure_has_linked_plan_items(db: Session, structure_id: int) -> bool:
    result = db.execute(
        text(
            """
            SELECT 1
            FROM learning_plan_items AS lpi
            INNER JOIN course_units AS cu
                ON cu.id = lpi.course_unit_id
            WHERE cu.course_structure_id = :structure_id
            LIMIT 1
            """
        ),
        {"structure_id": structure_id},
    ).scalar()

    return result is not None


def _refresh_existing_structure_aggregates(structure: CourseStructure) -> None:
    units = list(structure.units or [])
    total_units = len(units)
    total_minutes = sum(_resolve_existing_unit_minutes(unit) for unit in units)

    structure.total_units = total_units
    structure.total_minutes = total_minutes
    structure.build_status = "built"
    structure.build_notes = None
    structure.last_built_at = datetime.now(UTC)


def _apply_structure_duration_snapshot_to_course(
    course: Course,
    structure: CourseStructure,
) -> bool:
    if structure.build_status != "built":
        return False

    changed = False

    provider_metadata = dict(course.provider_metadata or {})
    quality_signals = dict(course.quality_signals or {})

    structure_last_built_at = (
        structure.last_built_at.isoformat()
        if structure.last_built_at is not None
        else None
    )

    updated_provider_metadata = {
        **provider_metadata,
        "structure_type": structure.structure_type,
        "structure_total_units": structure.total_units,
        "structure_total_minutes": structure.total_minutes,
        "structure_last_built_at": structure_last_built_at,
    }

    updated_quality_signals = {
        **quality_signals,
        "structure_type": structure.structure_type,
        "structure_total_units": structure.total_units,
        "duration_minutes_total": structure.total_minutes,
    }

    should_sync_playlist_duration = (
        structure.structure_type == "playlist"
        and structure.total_minutes > 0
    )

    should_sync_single_video_duration = (
        structure.structure_type == "single_video"
        and structure.total_minutes > 0
        and (course.duration_minutes_total is None or course.duration_minutes_total <= 0)
    )

    if should_sync_playlist_duration or should_sync_single_video_duration:
        if course.duration_minutes_total != structure.total_minutes:
            course.duration_minutes_total = structure.total_minutes
            changed = True

        if course.duration_is_estimated is not False:
            course.duration_is_estimated = False
            changed = True

        updated_provider_metadata["duration_source"] = "course_structure"
        updated_quality_signals["duration_source"] = "course_structure"
        updated_quality_signals["duration_is_estimated"] = False

    if course.provider_metadata != updated_provider_metadata:
        course.provider_metadata = updated_provider_metadata
        changed = True

    if course.quality_signals != updated_quality_signals:
        course.quality_signals = updated_quality_signals
        changed = True

    return changed


def sync_course_duration_snapshot_from_structure(
    db: Session,
    course_id: int,
) -> Course:
    course = get_course_by_id(db=db, course_id=course_id)
    if not course:
        raise NotFoundException("Course not found.")

    structure = get_course_structure_by_course_id(db=db, course_id=course_id)
    if not structure:
        raise NotFoundException("Course structure not found.")

    changed = _apply_structure_duration_snapshot_to_course(course=course, structure=structure)

    if changed:
        db.commit()
        db.refresh(course)

    return course


def build_course_structure(
    db: Session,
    course_id: int,
    force_rebuild: bool = False,
) -> CourseStructure:
    course = get_course_by_id(db=db, course_id=course_id)
    if not course:
        raise NotFoundException("Course not found.")

    existing_structure = get_course_structure_by_course_id(db=db, course_id=course_id)
    if existing_structure and existing_structure.build_status == "built" and not force_rebuild:
        changed = _apply_structure_duration_snapshot_to_course(
            course=course,
            structure=existing_structure,
        )
        if changed:
            db.commit()
        return get_course_structure_by_course_id(db=db, course_id=course_id)

    try:
        if existing_structure:
            if _structure_has_linked_plan_items(db=db, structure_id=existing_structure.id):
                logger.warning(
                    "Skipping destructive course structure rebuild because structure is linked to learning plan items. course_id=%s structure_id=%s",
                    course.id,
                    existing_structure.id,
                )

                _refresh_existing_structure_aggregates(existing_structure)
                _apply_structure_duration_snapshot_to_course(
                    course=course,
                    structure=existing_structure,
                )

                db.add(existing_structure)
                db.add(course)
                db.commit()
                db.refresh(existing_structure)
                db.refresh(course)
                return existing_structure

            structure = existing_structure
            db.query(CourseUnit).filter(
                CourseUnit.course_structure_id == structure.id
            ).delete(synchronize_session=False)
        else:
            structure = CourseStructure(
                course_id=course.id,
                source=course.source,
                content_type=course.content_type,
                structure_type=_detect_structure_type(course),
                build_status="pending",
                total_units=0,
                total_minutes=0,
                structure_metadata={},
                build_notes=None,
                last_built_at=None,
            )
            db.add(structure)
            db.flush()

        structure.source = course.source
        structure.content_type = course.content_type
        structure.structure_type = _detect_structure_type(course)
        structure.build_status = "pending"
        structure.build_notes = None
        db.flush()

        structure_type, units, metadata = _prepare_structure_units(course)

        total_minutes = sum(unit.estimated_minutes for unit in units)

        structure.structure_type = structure_type
        structure.total_units = len(units)
        structure.total_minutes = total_minutes
        structure.structure_metadata = metadata
        structure.build_status = "built"
        structure.build_notes = None
        structure.last_built_at = datetime.now(UTC)

        for unit in units:
            unit.course_structure_id = structure.id
            db.add(unit)

        _apply_structure_duration_snapshot_to_course(
            course=course,
            structure=structure,
        )

        db.commit()

        built_structure = get_course_structure_by_course_id(db=db, course_id=course_id)
        return built_structure

    except AppException as error:
        db.rollback()
        failed_structure = get_course_structure_by_course_id(db=db, course_id=course_id)
        if failed_structure:
            failed_structure.build_status = "failed"
            failed_structure.build_notes = error.message
            failed_structure.last_built_at = datetime.now(UTC)
            db.commit()
        raise
    except Exception as error:
        logger.exception(
            "Course structure build failed. course_id=%s",
            course_id,
        )
        db.rollback()

        failed_structure = get_course_structure_by_course_id(db=db, course_id=course_id)
        if failed_structure:
            failed_structure.build_status = "failed"
            failed_structure.build_notes = str(error)
            failed_structure.last_built_at = datetime.now(UTC)
            db.commit()

        raise AppException(
            "Course structure build failed.",
            status_code=500,
            error_code="course_structure_build_failed",
        ) from error
