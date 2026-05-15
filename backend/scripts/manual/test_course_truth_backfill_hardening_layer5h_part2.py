from __future__ import annotations

from pprint import pprint
from typing import Any

from app.db.session import new_session
from app.models.course import Course
from app.models.course_structure import CourseStructure
from app.services.course_structure_service import (
    build_course_structure,
    sync_course_duration_snapshot_from_structure,
)


def print_step(title: str) -> None:
    print(f"\n=== {title} ===")


def _load_or_build_built_structure(db) -> tuple[Course, CourseStructure]:
    structure = (
        db.query(CourseStructure)
        .filter(CourseStructure.build_status == "built")
        .filter(CourseStructure.total_minutes > 0)
        .order_by(CourseStructure.id.asc())
        .first()
    )

    if structure is not None:
        course = db.query(Course).filter(Course.id == structure.course_id).first()
        assert course is not None, "Built structure exists but course could not be loaded."
        return course, structure

    candidate_course = (
        db.query(Course)
        .filter(Course.source == "youtube")
        .filter(Course.content_type.in_(["playlist", "video"]))
        .order_by(Course.quality_score.desc().nullslast(), Course.id.asc())
        .first()
    )
    assert candidate_course is not None, "No eligible course was found to build a structure."

    built_structure = build_course_structure(
        db=db,
        course_id=candidate_course.id,
        force_rebuild=False,
    )
    assert built_structure is not None, "Course structure build returned no structure."
    assert built_structure.build_status == "built", "Expected a built course structure."
    assert built_structure.total_minutes > 0, "Expected a positive structure total_minutes."

    db.expire_all()

    refreshed_course = db.query(Course).filter(Course.id == candidate_course.id).first()
    refreshed_structure = (
        db.query(CourseStructure)
        .filter(CourseStructure.course_id == candidate_course.id)
        .first()
    )

    assert refreshed_course is not None, "Refreshed course could not be loaded."
    assert refreshed_structure is not None, "Refreshed structure could not be loaded."

    return refreshed_course, refreshed_structure


def _dirty_course_truth_fields(db, course: Course, structure: CourseStructure) -> None:
    provider_metadata = dict(course.provider_metadata or {})
    quality_signals = dict(course.quality_signals or {})

    course.duration_minutes_total = (structure.total_minutes or 0) + 17
    course.duration_is_estimated = True

    provider_metadata["duration_source"] = "manual_dirty_state"
    provider_metadata["structure_total_minutes"] = max(1, structure.total_minutes - 9)
    provider_metadata["structure_total_units"] = max(0, structure.total_units - 1)
    provider_metadata["structure_type"] = "dirty_structure_type"
    provider_metadata.pop("structure_last_built_at", None)

    quality_signals["duration_source"] = "manual_dirty_state"
    quality_signals["duration_minutes_total"] = max(1, structure.total_minutes - 11)
    quality_signals["duration_is_estimated"] = True
    quality_signals["structure_total_units"] = max(0, structure.total_units - 1)
    quality_signals["structure_type"] = "dirty_structure_type"

    course.provider_metadata = provider_metadata
    course.quality_signals = quality_signals

    db.add(course)
    db.commit()
    db.refresh(course)


def _course_truth_signature(course: Course) -> dict[str, Any]:
    provider_metadata = dict(course.provider_metadata or {})
    quality_signals = dict(course.quality_signals or {})

    return {
        "duration_minutes_total": course.duration_minutes_total,
        "duration_is_estimated": course.duration_is_estimated,
        "provider_metadata": {
            "duration_source": provider_metadata.get("duration_source"),
            "structure_type": provider_metadata.get("structure_type"),
            "structure_total_units": provider_metadata.get("structure_total_units"),
            "structure_total_minutes": provider_metadata.get("structure_total_minutes"),
            "structure_last_built_at": provider_metadata.get("structure_last_built_at"),
        },
        "quality_signals": {
            "duration_source": quality_signals.get("duration_source"),
            "duration_minutes_total": quality_signals.get("duration_minutes_total"),
            "duration_is_estimated": quality_signals.get("duration_is_estimated"),
            "structure_type": quality_signals.get("structure_type"),
            "structure_total_units": quality_signals.get("structure_total_units"),
        },
    }


def _apply_truth_backfill(db, course_id: int) -> dict[str, Any]:
    candidate_structures = (
        db.query(CourseStructure)
        .filter(CourseStructure.course_id == course_id)
        .filter(CourseStructure.build_status == "built")
        .filter(CourseStructure.total_minutes > 0)
        .order_by(CourseStructure.id.asc())
        .all()
    )

    candidate_course_ids = [structure.course_id for structure in candidate_structures]
    synchronized_course_ids: list[int] = []
    skipped_course_ids: list[int] = []

    for candidate_course_id in candidate_course_ids:
        before_course = db.query(Course).filter(Course.id == candidate_course_id).first()
        assert before_course is not None, "Candidate course could not be loaded before backfill."

        before_signature = _course_truth_signature(before_course)

        synchronized_course = sync_course_duration_snapshot_from_structure(
            db=db,
            course_id=candidate_course_id,
        )
        after_signature = _course_truth_signature(synchronized_course)

        if before_signature != after_signature:
            synchronized_course_ids.append(candidate_course_id)
        else:
            skipped_course_ids.append(candidate_course_id)

    return {
        "candidate_count": len(candidate_course_ids),
        "skipped_count": len(skipped_course_ids),
        "skipped_course_ids": skipped_course_ids,
        "synchronized_count": len(synchronized_course_ids),
        "synchronized_course_ids": synchronized_course_ids,
    }


def main() -> None:
    db = new_session()
    try:
        print_step("LOAD OR BUILD BUILT STRUCTURE")
        course, structure = _load_or_build_built_structure(db=db)

        print_step("DIRTY COURSE TRUTH FIELDS")
        _dirty_course_truth_fields(db=db, course=course, structure=structure)

        print_step("APPLY TRUTH BACKFILL")
        backfill_summary = _apply_truth_backfill(db=db, course_id=course.id)

        db.expire_all()

        course_after = db.query(Course).filter(Course.id == course.id).first()
        structure_after = (
            db.query(CourseStructure)
            .filter(CourseStructure.course_id == course.id)
            .first()
        )

        assert course_after is not None, "Course could not be reloaded after backfill."
        assert structure_after is not None, "Structure could not be reloaded after backfill."

        print_step("ASSERT COURSE TRUTH SYNC")
        assert backfill_summary["candidate_count"] == 1, "Expected exactly one backfill candidate."
        assert backfill_summary["synchronized_count"] == 1, "Expected exactly one synchronized course."
        assert backfill_summary["skipped_count"] == 0, "Expected zero skipped courses."

        assert course_after.duration_minutes_total == structure_after.total_minutes, (
            "Course duration_minutes_total must match structure total_minutes."
        )
        assert course_after.duration_is_estimated is False, (
            "Course duration must be marked as non-estimated after backfill."
        )

        provider_metadata = dict(course_after.provider_metadata or {})
        quality_signals = dict(course_after.quality_signals or {})

        assert provider_metadata.get("duration_source") == "course_structure", (
            "provider_metadata.duration_source must be 'course_structure'."
        )
        assert provider_metadata.get("structure_total_minutes") == structure_after.total_minutes, (
            "provider_metadata.structure_total_minutes must match structure total_minutes."
        )
        assert provider_metadata.get("structure_total_units") == structure_after.total_units, (
            "provider_metadata.structure_total_units must match structure total_units."
        )
        assert provider_metadata.get("structure_type") == structure_after.structure_type, (
            "provider_metadata.structure_type must match structure_type."
        )
        assert provider_metadata.get("structure_last_built_at"), (
            "provider_metadata.structure_last_built_at must be present."
        )

        assert quality_signals.get("duration_source") == "course_structure", (
            "quality_signals.duration_source must be 'course_structure'."
        )
        assert quality_signals.get("duration_minutes_total") == structure_after.total_minutes, (
            "quality_signals.duration_minutes_total must match structure total_minutes."
        )
        assert quality_signals.get("duration_is_estimated") is False, (
            "quality_signals.duration_is_estimated must be False."
        )
        assert quality_signals.get("structure_total_units") == structure_after.total_units, (
            "quality_signals.structure_total_units must match structure total_units."
        )
        assert quality_signals.get("structure_type") == structure_after.structure_type, (
            "quality_signals.structure_type must match structure_type."
        )

        print_step("COURSE TRUTH BACKFILL HARDENING LAYER 5H PART 2 PASSED")
        pprint(
            {
                "backfill_summary": backfill_summary,
                "course_after": {
                    "duration_is_estimated": course_after.duration_is_estimated,
                    "duration_minutes_total": course_after.duration_minutes_total,
                    "provider_metadata": course_after.provider_metadata,
                    "quality_signals": course_after.quality_signals,
                },
                "course_id": course_after.id,
                "course_title": course_after.title,
                "structure_id": structure_after.id,
                "structure_total_minutes": structure_after.total_minutes,
                "structure_total_units": structure_after.total_units,
            }
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()