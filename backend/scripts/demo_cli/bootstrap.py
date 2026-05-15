from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.timezone_utils import get_local_date, resolve_effective_timezone
from app.db.session import configure_session_factory, new_session
from app.models.course import Course
from app.models.course_structure import CourseStructure
from app.models.course_unit import CourseUnit
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_item import LearningPlanItem
from app.services.course_card_service import build_course_card
from app.services.plan_readiness_service import refresh_plan_summary
from app.services.topic_intelligence import build_background_seed_topics, extract_canonical_topics_from_text
from scripts.demo_cli import DEMO_SOURCE


@dataclass(slots=True)
class CatalogSeedResult:
    scope_key: str
    created_count: int
    reused_count: int
    courses: list[dict[str, Any]]


@dataclass(slots=True)
class RecoveryPrepResult:
    plan_id: int
    changed_items: list[dict[str, Any]]


def _slugify(value: str, *, max_length: int = 24) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not cleaned:
        return "demo"
    return cleaned[:max_length].strip("-") or "demo"


def _humanize_topic(value: str | None) -> str:
    if not value:
        return "Learning"
    return value.replace("_", " ").title()


def _choose_seed_topics(
    *,
    query: str,
    profile: dict[str, Any] | None,
    learning_state: dict[str, Any] | None,
) -> list[str]:
    topics = extract_canonical_topics_from_text(query)
    if learning_state:
        topics.extend(list(learning_state.get("emerging_interests") or []))
        topics.extend(list(learning_state.get("dominant_interests") or []))
    if profile:
        topics.extend(build_background_seed_topics(profile.get("primary_track") or profile.get("background_track")))

    deduped: list[str] = []
    seen: set[str] = set()
    for topic in topics:
        if topic and topic not in seen:
            seen.add(topic)
            deduped.append(topic)

    if not deduped:
        return ["python", "backend"]
    return deduped[:4]


def _seed_templates(primary_topic: str, secondary_topic: str) -> list[dict[str, Any]]:
    primary_label = _humanize_topic(primary_topic)
    secondary_label = _humanize_topic(secondary_topic)
    return [
        {
            "key": "foundation",
            "content_type": "video",
            "structure_type": "segmented_video",
            "title": f"[SOLA Demo] {primary_label} Foundations",
            "description": (
                f"A deterministic demo course covering the foundations of {primary_label} "
                "through short, schedulable study units."
            ),
            "difficulty_level": "beginner",
            "progression_hint": "foundation",
            "duration_minutes_total": 90,
            "units": [
                ("lesson", f"{primary_label} essentials", 30, "theoretical", "light"),
                ("lesson", f"Hands-on {primary_label} setup", 30, "practical", "medium"),
                ("lesson", f"{primary_label} practice session", 30, "practical", "medium"),
            ],
        },
        {
            "key": "project",
            "content_type": "playlist",
            "structure_type": "playlist",
            "title": f"[SOLA Demo] Guided {primary_label} Project",
            "description": (
                f"A deterministic demo playlist that turns {primary_label} into a guided "
                "project flow for plan and recovery demonstrations."
            ),
            "difficulty_level": "beginner",
            "progression_hint": "next_step",
            "duration_minutes_total": 120,
            "units": [
                ("playlist_video", f"Project kickoff in {primary_label}", 35, "practical", "medium"),
                ("playlist_video", f"Build the core {primary_label} workflow", 40, "practical", "medium"),
                ("playlist_video", f"Review and improve the project", 45, "mixed", "heavy"),
            ],
        },
        {
            "key": "workflow",
            "content_type": "video",
            "structure_type": "segmented_video",
            "title": f"[SOLA Demo] Applied {secondary_label} Workflow",
            "description": (
                f"A deterministic demo course showing the next-step workflow between "
                f"{primary_label} and {secondary_label}."
            ),
            "difficulty_level": "intermediate",
            "progression_hint": "next_step",
            "duration_minutes_total": 75,
            "units": [
                ("lesson", f"{secondary_label} workflow overview", 25, "theoretical", "light"),
                ("lesson", f"Implementing the {secondary_label} flow", 25, "practical", "medium"),
                ("lesson", f"Applying the flow in a real study plan", 25, "mixed", "medium"),
            ],
        },
    ]


def _scope_key(namespace: str, user_id: int, query: str) -> str:
    return f"{_slugify(namespace, max_length=18)}-{user_id}-{_slugify(query, max_length=18)}"


def _external_id(scope_key: str, template_key: str) -> str:
    return f"sola-demo-{scope_key}-{template_key}"


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _ensure_course(
    db: Session,
    *,
    user_id: int,
    scope_key: str,
    language: str,
    topics: list[str],
    template: dict[str, Any],
) -> tuple[Course, bool]:
    external_id = _external_id(scope_key, template["key"])
    course = db.query(Course).filter(Course.external_id == external_id).first()
    created = False

    if course is None:
        course = Course(
            source=DEMO_SOURCE,
            external_id=external_id,
            content_type=template["content_type"],
            title=template["title"],
            description=template["description"],
            provider="sola_demo",
            channel_title="SOLA Demo Catalog",
            instructor_name="SOLA Demo Team",
            language=language,
            level=template["difficulty_level"],
            difficulty_level=template["difficulty_level"],
            duration_minutes_total=template["duration_minutes_total"],
            duration_is_estimated=False,
            pricing_model="free",
            topic_tags=topics,
            quality_score=88,
            quality_signals={"demo_seed": True, "scope_key": scope_key},
            prerequisite_hint=None,
            progression_hint=template["progression_hint"],
            provider_metadata={
                "demo_seed": True,
                "demo_scope_key": scope_key,
                "demo_user_id": user_id,
                "demo_seed_version": 1,
            },
            url=None,
            thumbnail_url=None,
            published_at=None,
        )
        db.add(course)
        db.flush()
        created = True

    return course, created


def _ensure_structure_and_units(db: Session, *, course: Course, template: dict[str, Any]) -> None:
    structure = db.query(CourseStructure).filter(CourseStructure.course_id == course.id).first()
    if structure is None:
        structure = CourseStructure(
            course_id=course.id,
            source=course.source,
            content_type=course.content_type,
            structure_type=template["structure_type"],
            build_status="built",
            total_units=0,
            total_minutes=0,
            structure_metadata={"demo_seed": True},
            build_notes=None,
            last_built_at=_now_utc(),
        )
        db.add(structure)
        db.flush()

    structure.source = course.source
    structure.content_type = course.content_type
    structure.structure_type = template["structure_type"]
    structure.build_status = "built"
    structure.structure_metadata = {"demo_seed": True}
    structure.build_notes = None
    structure.last_built_at = _now_utc()

    for index, (unit_type, title, minutes, practical_signal, load_signal) in enumerate(template["units"], start=1):
        unit = (
            db.query(CourseUnit)
            .filter(CourseUnit.course_structure_id == structure.id)
            .filter(CourseUnit.source_order_index == index)
            .first()
        )
        if unit is None:
            unit = CourseUnit(
                course_structure_id=structure.id,
                external_unit_id=f"{course.external_id}-unit-{index}",
                unit_type=unit_type,
                title=title,
                description=None,
                source_order_index=index,
                raw_duration_seconds=minutes * 60,
                estimated_minutes=minutes,
                start_second=(index - 1) * minutes * 60 if course.content_type == "video" else None,
                end_second=index * minutes * 60 if course.content_type == "video" else None,
                practical_signal=practical_signal,
                load_signal=load_signal,
                source_metadata={"demo_seed": True, "demo_scope_key": course.external_id},
            )
            db.add(unit)

    units = (
        db.query(CourseUnit)
        .filter(CourseUnit.course_structure_id == structure.id)
        .order_by(CourseUnit.source_order_index.asc())
        .all()
    )
    structure.total_units = len(units)
    structure.total_minutes = sum(unit.estimated_minutes for unit in units)
    course.duration_minutes_total = structure.total_minutes
    course.duration_is_estimated = False


def ensure_demo_catalog(
    *,
    user_id: int,
    namespace: str,
    query: str,
    profile: dict[str, Any] | None,
    learning_state: dict[str, Any] | None,
) -> CatalogSeedResult:
    configure_session_factory()
    db = new_session()
    try:
        topics = _choose_seed_topics(query=query, profile=profile, learning_state=learning_state)
        primary_topic = topics[0]
        secondary_topic = topics[1] if len(topics) > 1 else topics[0]
        scope_key = _scope_key(namespace, user_id, query)
        language = "en"
        if profile and profile.get("preferred_language") in {"ar", "en"}:
            language = profile["preferred_language"]

        created_count = 0
        reused_count = 0
        seeded_courses: list[dict[str, Any]] = []

        for template in _seed_templates(primary_topic, secondary_topic):
            course, created = _ensure_course(
                db,
                user_id=user_id,
                scope_key=scope_key,
                language=language,
                topics=topics,
                template=template,
            )
            _ensure_structure_and_units(db, course=course, template=template)
            seeded_courses.append(build_course_card(course))
            if created:
                created_count += 1
            else:
                reused_count += 1

        db.commit()
        return CatalogSeedResult(
            scope_key=scope_key,
            created_count=created_count,
            reused_count=reused_count,
            courses=seeded_courses,
        )
    finally:
        db.close()


def prepare_recovery_state(*, user_id: int, plan_id: int) -> RecoveryPrepResult:
    configure_session_factory()
    db = new_session()
    try:
        plan = (
            db.query(LearningPlan)
            .filter(LearningPlan.user_id == user_id)
            .filter(LearningPlan.id == plan_id)
            .first()
        )
        if plan is None:
            raise ValueError(f"Learning plan {plan_id} for user {user_id} was not found.")

        timezone_name = resolve_effective_timezone(plan.schedule_timezone_snapshot)
        local_today = get_local_date(timezone_name)
        pending_items = (
            db.query(LearningPlanItem)
            .filter(LearningPlanItem.plan_id == plan.id)
            .filter(LearningPlanItem.status == "pending")
            .order_by(LearningPlanItem.scheduled_date.asc(), LearningPlanItem.schedule_order_index.asc())
            .all()
        )

        changed_items: list[dict[str, Any]] = []
        for item in pending_items:
            if item.scheduled_date < local_today:
                continue
            old_date = item.scheduled_date
            new_date = local_today - timedelta(days=2 + len(changed_items))
            item.scheduled_date = new_date
            changed_items.append(
                {
                    "item_id": item.id,
                    "title": item.title,
                    "old_scheduled_date": old_date.isoformat(),
                    "new_scheduled_date": new_date.isoformat(),
                    "reason": "Pending item date moved into the past so recovery preview can truthfully detect overdue work.",
                }
            )
            if len(changed_items) == 2:
                break

        refresh_plan_summary(db=db, plan=plan)
        db.commit()

        return RecoveryPrepResult(
            plan_id=plan.id,
            changed_items=changed_items,
        )
    finally:
        db.close()
