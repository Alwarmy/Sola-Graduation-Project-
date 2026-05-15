
from typing import Any

from sqlalchemy.orm import Session

from app.models.course import Course
from app.services.course_card_service import build_course_card
from app.services.discovery_personalization_service import (
    MIN_RECOMMENDATION_SCORE,
    evaluate_course_discovery_fit,
    load_discovery_context,
)


def get_personalized_recommendations(
    db: Session,
    user_id: int,
    limit: int = 20,
) -> list[dict[str, Any]]:
    context = load_discovery_context(db=db, user_id=user_id)

    courses = (
        db.query(Course)
        .filter(Course.language.in_(["ar", "en"]))
        .order_by(Course.quality_score.desc().nullslast(), Course.id.desc())
        .all()
    )

    scored_items: list[tuple[float, dict[str, Any]]] = []

    for course in courses:
        evaluation = evaluate_course_discovery_fit(course=course, context=context)

        if evaluation.history_details.get("already_selected"):
            continue

        if evaluation.final_score < MIN_RECOMMENDATION_SCORE:
            continue

        scored_items.append(
            (
                evaluation.final_score,
                build_course_card(course=course, personalization=evaluation.personalization),
            )
        )

    scored_items.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored_items[:limit]]
