import pytest

pytest.importorskip("sqlalchemy")

from app.services.course_search_service import CourseSearchParams, normalize_course_search_params


def test_normalize_course_search_params_extracts_query_intelligence() -> None:
    normalized = normalize_course_search_params(
        CourseSearchParams(
            q="machine learning python beginner",
            sort_by="personalized",
            limit=5,
            offset=0,
        )
    )

    assert normalized.q == "machine learning python beginner"
    assert normalized.query_topics == ["machine_learning", "python"]
    assert normalized.query_difficulty_hint == "beginner"
    assert normalized.query_progression_hint == "foundation"
    assert normalized.sort_by == "personalized"


def test_normalize_course_search_params_falls_back_to_quality_when_query_is_missing() -> None:
    normalized = normalize_course_search_params(
        CourseSearchParams(
            q="   ",
            sort_by="relevance",
        )
    )

    assert normalized.q is None
    assert normalized.sort_by == "quality"
    assert normalized.query_tokens == []
    assert normalized.query_topics == []
