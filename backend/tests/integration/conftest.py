from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path
from typing import Callable

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.deps import get_db
from app.core.config import get_settings
from app.core.rate_limiter import rate_limiter
from app.core.security import hash_password
from app.core.timezone_utils import get_local_date, resolve_effective_timezone
from app.models.assistant_action_run import AssistantActionRun
from app.models.assistant_conversation import AssistantConversation
from app.models.course import Course
from app.models.course_structure import CourseStructure
from app.models.course_unit import CourseUnit
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_item import LearningPlanItem
from app.models.schedule_queue_item import ScheduleQueueItem
from app.models.user import User
from app.models.user_learning_state import UserLearningState
from app.models.user_profile import UserProfile
from app.schemas.learning_plan import LearningPlanCreateRequest
from app.services.plan_lifecycle_service import create_learning_plan
from app.services.plan_readiness_service import refresh_plan_summary
from app.services.plan_schedule_service import generate_initial_plan_schedule


pytestmark = pytest.mark.integration


def _truncate_all_tables(engine: Engine) -> None:
    with engine.begin() as connection:
        table_names = connection.execute(
            text(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename <> 'alembic_version'
                ORDER BY tablename
                """
            )
        ).scalars().all()
        if not table_names:
            return

        joined_tables = ", ".join(f'"{table_name}"' for table_name in table_names)
        connection.execute(text(f"TRUNCATE TABLE {joined_tables} RESTART IDENTITY CASCADE"))


@pytest.fixture(scope="session")
def integration_database_url() -> str:
    database_url = os.getenv("INTEGRATION_DATABASE_URL") or os.getenv("DATABASE_URL", "")
    if not database_url.startswith("postgresql"):
        pytest.skip("Postgres integration DATABASE_URL is not configured.")

    os.environ["DATABASE_URL"] = database_url
    os.environ.setdefault("JWT_SECRET", "integration-jwt-secret")
    os.environ.setdefault("REFRESH_TOKEN_SECRET", "integration-refresh-secret")
    os.environ.setdefault("APP_TIMEZONE", "Asia/Riyadh")
    os.environ.setdefault("RATE_LIMIT_BACKEND", "memory")
    get_settings.cache_clear()
    rate_limiter.reset_backend_cache()
    rate_limiter.reset()
    return database_url


@pytest.fixture(scope="session")
def integration_engine(integration_database_url: str) -> Engine:
    alembic_config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", integration_database_url)
    command.upgrade(alembic_config, "head")

    engine = create_engine(integration_database_url, pool_pre_ping=True)
    _truncate_all_tables(engine)
    yield engine
    _truncate_all_tables(engine)
    engine.dispose()


@pytest.fixture()
def db_session(integration_engine: Engine) -> Session:
    _truncate_all_tables(integration_engine)
    session_factory = sessionmaker(
        bind=integration_engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
        rate_limiter.reset()
        rate_limiter.reset_backend_cache()
        _truncate_all_tables(integration_engine)


@pytest.fixture()
def client(db_session: Session):
    import app.db.session as db_session_module
    from app.main import app

    db_session_module._engine = None

    def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def create_user_bundle(db_session: Session) -> Callable[..., User]:
    def _create_user_bundle(*, email: str = "user@example.com", password: str = "Secret123!") -> User:
        user = User(
            email=email,
            full_name="Integration User",
            hashed_password=hash_password(password),
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        profile = UserProfile(
            user_id=user.id,
            background_track="software_engineering",
            primary_track="software_engineering",
            secondary_tracks=[],
            target_role="backend_engineer",
            experience_level="junior",
            employment_status="job_seeker",
            is_student=False,
            education_major=None,
            weekly_hours=10,
            goal="Become job-ready.",
            preferred_language="en",
            bio=None,
            timezone="Asia/Riyadh",
        )
        learning_state = UserLearningState(
            user_id=user.id,
            dominant_interests=["python"],
            emerging_interests=["architecture"],
            covered_topics=[],
            topic_familiarity={},
            topic_families={},
            current_focus="python",
            preferred_content_type="video",
            preferred_course_length="medium",
            effective_preferred_language="en",
            engagement_score=50,
            source_profile_snapshot={},
            source_event_summary={},
            profile_alignment={},
        )
        db_session.add(profile)
        db_session.add(learning_state)
        db_session.commit()
        return user

    return _create_user_bundle


@pytest.fixture()
def create_course_with_structure(db_session: Session) -> Callable[..., Course]:
    def _create_course_with_structure(*, external_suffix: str, title: str) -> Course:
        course = Course(
            source="youtube",
            external_id=f"course-{external_suffix}",
            content_type="video",
            title=title,
            description=f"{title} description",
            provider="youtube",
            channel_title="SOLA Channel",
            instructor_name="Instructor",
            language="en",
            level="beginner",
            difficulty_level="beginner",
            duration_minutes_total=60,
            duration_is_estimated=False,
            pricing_model="free",
            topic_tags=["python"],
            quality_score=90,
            quality_signals={"curated": True},
            prerequisite_hint=None,
            progression_hint="foundational",
            provider_metadata={},
            url=f"https://example.com/{external_suffix}",
            thumbnail_url=None,
            published_at=None,
        )
        db_session.add(course)
        db_session.commit()
        db_session.refresh(course)

        structure = CourseStructure(
            course_id=course.id,
            source="youtube",
            content_type="video",
            structure_type="segmented_video",
            build_status="built",
            total_units=2,
            total_minutes=60,
            structure_metadata={},
            build_notes=None,
            last_built_at=None,
        )
        db_session.add(structure)
        db_session.commit()
        db_session.refresh(structure)

        first_unit = CourseUnit(
            course_structure_id=structure.id,
            external_unit_id=f"{external_suffix}-u1",
            unit_type="lesson",
            title=f"{title} Part 1",
            description=None,
            source_order_index=1,
            raw_duration_seconds=1800,
            estimated_minutes=30,
            start_second=0,
            end_second=1800,
            practical_signal="mixed",
            load_signal="medium",
            source_metadata={},
        )
        second_unit = CourseUnit(
            course_structure_id=structure.id,
            external_unit_id=f"{external_suffix}-u2",
            unit_type="lesson",
            title=f"{title} Part 2",
            description=None,
            source_order_index=2,
            raw_duration_seconds=1800,
            estimated_minutes=30,
            start_second=1800,
            end_second=3600,
            practical_signal="mixed",
            load_signal="medium",
            source_metadata={},
        )
        db_session.add_all([first_unit, second_unit])
        db_session.commit()
        db_session.refresh(course)
        return course

    return _create_course_with_structure


@pytest.fixture()
def create_learning_plan_bundle(
    db_session: Session,
    create_course_with_structure: Callable[..., Course],
) -> Callable[..., LearningPlan]:
    def _create_learning_plan_bundle(
        *,
        user: User,
        course_count: int = 1,
        title: str = "SOLA Plan",
    ) -> LearningPlan:
        queue_item_ids: list[int] = []
        for index in range(course_count):
            course = create_course_with_structure(
                external_suffix=f"{user.id}-{index + 1}",
                title=f"Course {index + 1}",
            )
            queue_item = ScheduleQueueItem(
                user_id=user.id,
                course_id=course.id,
                status="queued",
                note=None,
            )
            db_session.add(queue_item)
            db_session.commit()
            db_session.refresh(queue_item)
            queue_item_ids.append(queue_item.id)

        plan = create_learning_plan(
            db=db_session,
            user_id=user.id,
            payload=LearningPlanCreateRequest(
                title=title,
                goal="Stay on track.",
                queue_item_ids=queue_item_ids,
                preferred_time_window="evening",
                pace_mode="balanced",
                preferred_study_days=["sunday", "monday", "tuesday"],
                max_daily_minutes=90,
                session_cap_minutes=30,
                temporary_note=None,
                deadline_date=None,
            ),
        )
        return plan

    return _create_learning_plan_bundle


@pytest.fixture()
def generate_plan_schedule_bundle(db_session: Session) -> Callable[..., LearningPlan]:
    def _generate_plan_schedule_bundle(*, user: User, plan: LearningPlan, force_rebuild: bool = False) -> LearningPlan:
        refreshed_plan = db_session.query(LearningPlan).filter(LearningPlan.id == plan.id).first()
        generated_plan = generate_initial_plan_schedule(
            db=db_session,
            user_id=user.id,
            plan_id=refreshed_plan.id,
            force_rebuild=force_rebuild,
            expected_version=refreshed_plan.version,
            expected_schedule_revision=refreshed_plan.schedule_revision if force_rebuild else None,
        )
        return generated_plan

    return _generate_plan_schedule_bundle


@pytest.fixture()
def mark_plan_as_drifted(db_session: Session) -> Callable[..., LearningPlan]:
    def _mark_plan_as_drifted(*, plan: LearningPlan) -> LearningPlan:
        refreshed_plan = db_session.query(LearningPlan).filter(LearningPlan.id == plan.id).first()
        pending_items = (
            db_session.query(LearningPlanItem)
            .filter(LearningPlanItem.plan_id == refreshed_plan.id)
            .filter(LearningPlanItem.status == "pending")
            .order_by(LearningPlanItem.schedule_order_index.asc())
            .all()
        )
        assert pending_items, "Plan must have pending items before it can drift."

        local_today = get_local_date(resolve_effective_timezone(refreshed_plan.schedule_timezone_snapshot))
        drifted_date = local_today - timedelta(days=2)
        for item in pending_items[:2]:
            item.scheduled_date = drifted_date

        db_session.flush()
        refresh_plan_summary(db=db_session, plan=refreshed_plan)
        db_session.commit()
        return refreshed_plan

    return _mark_plan_as_drifted


@pytest.fixture()
def create_conversation(db_session: Session) -> Callable[..., AssistantConversation]:
    def _create_conversation(*, user: User, title: str = "Assistant Conversation") -> AssistantConversation:
        conversation = AssistantConversation(
            user_id=user.id,
            title=title,
            status="active",
            conversation_metadata={},
            last_user_message_at=None,
            last_assistant_message_at=None,
        )
        db_session.add(conversation)
        db_session.commit()
        db_session.refresh(conversation)
        return conversation

    return _create_conversation


@pytest.fixture()
def create_action_run(db_session: Session) -> Callable[..., AssistantActionRun]:
    def _create_action_run(
        *,
        user: User,
        conversation: AssistantConversation,
        action_type: str,
        request_payload: dict,
        preview_payload: dict,
    ) -> AssistantActionRun:
        action_run = AssistantActionRun(
            user_id=user.id,
            conversation_id=conversation.id,
            source_message_id=None,
            action_type=action_type,
            status="proposed",
            request_payload=request_payload,
            preview_payload=preview_payload,
            result_payload={},
            failure_reason=None,
        )
        db_session.add(action_run)
        db_session.commit()
        db_session.refresh(action_run)
        return action_run

    return _create_action_run
