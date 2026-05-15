import json

from app.db.session import new_session
from app.models.course import Course
from app.services.course_structure_service import build_course_structure


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def _select_playlist_candidate(courses: list[Course]) -> Course | None:
    filtered = [
        course
        for course in courses
        if course.language in {"ar", "en"}
        and course.quality_score is not None
        and "hindi" not in (course.title or "").lower()
        and "urdu" not in (course.title or "").lower()
    ]

    preferred = [
        course
        for course in filtered
        if course.duration_is_estimated or course.duration_minutes_total is None
    ]

    if preferred:
        return preferred[0]
    if filtered:
        return filtered[0]
    if courses:
        return courses[0]
    return None


def main() -> None:
    db = new_session()
    try:
        print_step("LOAD PLAYLIST COURSE")

        candidate_courses = (
            db.query(Course)
            .filter(Course.source == "youtube")
            .filter(Course.content_type == "playlist")
            .order_by(Course.quality_score.desc().nullslast(), Course.id.asc())
            .all()
        )

        course = _select_playlist_candidate(candidate_courses)
        assert course is not None, "No YouTube playlist course was found."

        before_duration = course.duration_minutes_total
        before_is_estimated = course.duration_is_estimated

        print_step("BUILD OR REBUILD COURSE STRUCTURE")
        structure = build_course_structure(
            db=db,
            course_id=course.id,
            force_rebuild=True,
        )

        db.expire_all()

        refreshed_course = db.query(Course).filter(Course.id == course.id).first()
        assert refreshed_course is not None, "Refreshed course could not be loaded."

        print_step("ASSERT DURATION SNAPSHOT SYNC")
        assert structure.build_status == "built", "Course structure must be built."
        assert structure.structure_type == "playlist", "Expected playlist structure."
        assert structure.total_minutes > 0, "Expected positive structure total_minutes."

        assert refreshed_course.duration_minutes_total == structure.total_minutes, (
            "Course duration_minutes_total must match CourseStructure.total_minutes."
        )
        assert refreshed_course.duration_is_estimated is False, (
            "Playlist duration must become non-estimated after structure build."
        )

        provider_metadata = refreshed_course.provider_metadata or {}
        quality_signals = refreshed_course.quality_signals or {}

        assert provider_metadata.get("duration_source") == "course_structure", (
            "provider_metadata.duration_source must be 'course_structure'."
        )
        assert provider_metadata.get("structure_total_minutes") == structure.total_minutes
        assert provider_metadata.get("structure_total_units") == structure.total_units

        assert quality_signals.get("duration_source") == "course_structure", (
            "quality_signals.duration_source must be 'course_structure'."
        )
        assert quality_signals.get("duration_minutes_total") == structure.total_minutes
        assert quality_signals.get("duration_is_estimated") is False

        print_step("COURSE PLAYLIST DURATION ACCURACY HARDENING LAYER 4 PART 1A PASSED")
        print(
            json.dumps(
                {
                    "course_id": refreshed_course.id,
                    "course_title": refreshed_course.title,
                    "duration_before": before_duration,
                    "duration_is_estimated_before": before_is_estimated,
                    "duration_after": refreshed_course.duration_minutes_total,
                    "duration_is_estimated_after": refreshed_course.duration_is_estimated,
                    "structure_total_units": structure.total_units,
                    "structure_total_minutes": structure.total_minutes,
                    "provider_metadata": refreshed_course.provider_metadata,
                    "quality_signals": refreshed_course.quality_signals,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
