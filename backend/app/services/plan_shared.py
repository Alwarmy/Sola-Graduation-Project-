from sqlalchemy.orm import Session

from app.core.domain_values import (
    OPEN_LEARNING_PLAN_STATUS_VALUES,
    TERMINAL_LEARNING_PLAN_STATUS_VALUES,
)
from app.core.exceptions import ConflictException, ValidationException
from app.core.timezone_utils import resolve_effective_timezone
from app.models.course import Course
from app.models.learning_plan import LearningPlan
from app.models.learning_plan_course import LearningPlanCourse
from app.models.learning_plan_item import LearningPlanItem
from app.models.schedule_queue_item import ScheduleQueueItem
from app.models.scheduling_preference import SchedulingPreference
from app.models.user_learning_state import UserLearningState
from app.models.user_profile import UserProfile
from app.schemas.learning_plan import (
    PACE_MODE_OPTIONS,
    STUDY_DAY_OPTIONS,
    TIME_WINDOW_OPTIONS,
)

MAX_ACTIVE_PLAN_COURSES = 3

OPEN_PLAN_STATUSES = set(OPEN_LEARNING_PLAN_STATUS_VALUES)
MODIFIABLE_PLAN_STATUSES = set(OPEN_LEARNING_PLAN_STATUS_VALUES)
TERMINAL_PLAN_STATUSES = set(TERMINAL_LEARNING_PLAN_STATUS_VALUES)

ALLOWED_PLAN_STATUS_TRANSITIONS = {
    "active": {"paused", "archived", "completed"},
    "paused": {"active", "archived", "completed"},
    "archived": set(),
    "completed": set(),
}


def get_user_profile_for_planning(db: Session, user_id: int) -> UserProfile | None:
    return (
        db.query(UserProfile)
        .filter(UserProfile.user_id == user_id)
        .first()
    )


def get_user_learning_state_for_planning(
    db: Session,
    user_id: int,
) -> UserLearningState | None:
    return (
        db.query(UserLearningState)
        .filter(UserLearningState.user_id == user_id)
        .first()
    )


def get_active_learning_plan(db: Session, user_id: int) -> LearningPlan | None:
    return (
        db.query(LearningPlan)
        .filter(LearningPlan.user_id == user_id)
        .filter(LearningPlan.status == "active")
        .first()
    )


def get_open_learning_plan(
    db: Session,
    user_id: int,
    exclude_plan_id: int | None = None,
) -> LearningPlan | None:
    query = (
        db.query(LearningPlan)
        .filter(LearningPlan.user_id == user_id)
        .filter(LearningPlan.status.in_(list(OPEN_PLAN_STATUSES)))
    )

    if exclude_plan_id is not None:
        query = query.filter(LearningPlan.id != exclude_plan_id)

    return query.first()


def get_learning_plan_by_id(
    db: Session,
    user_id: int,
    plan_id: int,
) -> LearningPlan | None:
    return (
        db.query(LearningPlan)
        .filter(LearningPlan.user_id == user_id)
        .filter(LearningPlan.id == plan_id)
        .first()
    )


def list_user_learning_plans(db: Session, user_id: int) -> list[LearningPlan]:
    return (
        db.query(LearningPlan)
        .filter(LearningPlan.user_id == user_id)
        .order_by(LearningPlan.updated_at.desc(), LearningPlan.id.desc())
        .all()
    )


def list_schedule_queue_items(db: Session, user_id: int) -> list[ScheduleQueueItem]:
    return (
        db.query(ScheduleQueueItem)
        .filter(ScheduleQueueItem.user_id == user_id)
        .order_by(ScheduleQueueItem.id.desc())
        .all()
    )


def get_schedule_queue_item(
    db: Session,
    user_id: int,
    queue_item_id: int,
) -> ScheduleQueueItem | None:
    return (
        db.query(ScheduleQueueItem)
        .filter(ScheduleQueueItem.user_id == user_id)
        .filter(ScheduleQueueItem.id == queue_item_id)
        .first()
    )


def get_plan_courses(db: Session, plan_id: int) -> list[LearningPlanCourse]:
    return (
        db.query(LearningPlanCourse)
        .filter(LearningPlanCourse.plan_id == plan_id)
        .order_by(LearningPlanCourse.order_index.asc(), LearningPlanCourse.id.asc())
        .all()
    )


def get_plan_preference(db: Session, plan_id: int) -> SchedulingPreference | None:
    return (
        db.query(SchedulingPreference)
        .filter(SchedulingPreference.plan_id == plan_id)
        .first()
    )


def get_course_by_id(db: Session, course_id: int) -> Course | None:
    return db.query(Course).filter(Course.id == course_id).first()


def is_course_in_any_open_plan(
    db: Session,
    user_id: int,
    course_id: int,
    exclude_plan_id: int | None = None,
) -> bool:
    query = (
        db.query(LearningPlanCourse)
        .join(LearningPlan, LearningPlanCourse.plan_id == LearningPlan.id)
        .filter(LearningPlan.user_id == user_id)
        .filter(LearningPlan.status.in_(list(OPEN_PLAN_STATUSES)))
        .filter(LearningPlanCourse.course_id == course_id)
    )

    if exclude_plan_id is not None:
        query = query.filter(LearningPlan.id != exclude_plan_id)

    return query.first() is not None


def validate_preference_values(
    preferred_time_window: str | None,
    pace_mode: str | None,
    preferred_study_days: list[str],
    max_daily_minutes: int | None,
    session_cap_minutes: int | None,
) -> None:
    if preferred_time_window and preferred_time_window not in TIME_WINDOW_OPTIONS:
        raise ValidationException("Invalid preferred_time_window.")

    if pace_mode and pace_mode not in PACE_MODE_OPTIONS:
        raise ValidationException("Invalid pace_mode.")

    invalid_days = [day for day in preferred_study_days if day not in STUDY_DAY_OPTIONS]
    if invalid_days:
        raise ValidationException("Invalid preferred_study_days.")

    if max_daily_minutes is not None and not 30 <= max_daily_minutes <= 180:
        raise ValidationException("max_daily_minutes must be between 30 and 180.")

    if session_cap_minutes is not None and not 15 <= session_cap_minutes <= 45:
        raise ValidationException("session_cap_minutes must be between 15 and 45.")

    if (
        max_daily_minutes is not None
        and session_cap_minutes is not None
        and max_daily_minutes < session_cap_minutes
    ):
        raise ValidationException("max_daily_minutes cannot be less than session_cap_minutes.")


def infer_default_time_window(profile: UserProfile) -> str:
    if profile.employment_status == "employed":
        return "evening"

    if profile.is_student:
        return "evening"

    if profile.employment_status in {"unemployed", "job_seeker"}:
        return "afternoon"

    return "evening"


def infer_default_pace_mode(profile: UserProfile) -> str:
    if profile.weekly_hours <= 4:
        return "relaxed"
    if profile.weekly_hours <= 10:
        return "balanced"
    return "accelerated"


def infer_default_study_days(profile: UserProfile) -> list[str]:
    ordered_days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ]

    if profile.weekly_hours <= 4:
        return ordered_days[:3]
    if profile.weekly_hours <= 8:
        return ordered_days[:4]
    if profile.weekly_hours <= 14:
        return ordered_days[:5]

    return ordered_days[:6]


def build_learning_state_snapshot(
    learning_state: UserLearningState | None,
) -> dict:
    if not learning_state:
        return {}

    return {
        "dominant_interests": learning_state.dominant_interests,
        "emerging_interests": learning_state.emerging_interests,
        "covered_topics": learning_state.covered_topics,
        "current_focus": learning_state.current_focus,
        "preferred_content_type": learning_state.preferred_content_type,
        "preferred_course_length": learning_state.preferred_course_length,
        "effective_preferred_language": learning_state.effective_preferred_language,
        "engagement_score": learning_state.engagement_score,
        "topic_families": learning_state.topic_families,
        "profile_alignment": learning_state.profile_alignment,
    }


def build_scheduling_preference(
    profile: UserProfile,
    plan_id: int,
    preferred_time_window: str | None,
    pace_mode: str | None,
    preferred_study_days: list[str],
    max_daily_minutes: int | None,
    session_cap_minutes: int | None,
    temporary_note: str | None,
    deadline_date,
) -> SchedulingPreference:
    validate_preference_values(
        preferred_time_window=preferred_time_window,
        pace_mode=pace_mode,
        preferred_study_days=preferred_study_days,
        max_daily_minutes=max_daily_minutes,
        session_cap_minutes=session_cap_minutes,
    )

    return SchedulingPreference(
        plan_id=plan_id,
        preferred_time_window=preferred_time_window or infer_default_time_window(profile),
        pace_mode=pace_mode or infer_default_pace_mode(profile),
        preferred_study_days=preferred_study_days or infer_default_study_days(profile),
        max_daily_minutes=max_daily_minutes or 180,
        session_cap_minutes=session_cap_minutes or 45,
        temporary_note=temporary_note,
        deadline_date=deadline_date,
    )


def validate_unique_queue_item_ids(queue_item_ids: list[int]) -> None:
    if len(queue_item_ids) != len(set(queue_item_ids)):
        raise ValidationException("queue_item_ids must be unique.")


def assert_plan_is_modifiable(plan: LearningPlan) -> None:
    if plan.status not in MODIFIABLE_PLAN_STATUSES:
        raise ConflictException("This learning plan cannot be modified in its current status.")


def plan_has_schedule_items(
    db: Session,
    plan_id: int,
) -> bool:
    return (
        db.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == plan_id)
        .first()
        is not None
    )


def plan_has_execution_history(
    db: Session,
    plan_id: int,
) -> bool:
    items = (
        db.query(LearningPlanItem)
        .filter(LearningPlanItem.plan_id == plan_id)
        .all()
    )

    for item in items:
        if item.status != "pending":
            return True
        if item.actual_started_at is not None:
            return True
        if item.actual_completed_at is not None:
            return True
        if item.skipped_at is not None:
            return True

    return False


def normalize_plan_course_order(
    db: Session,
    plan_id: int,
) -> None:
    plan_courses = get_plan_courses(db=db, plan_id=plan_id)

    for index, plan_course in enumerate(plan_courses, start=1):
        plan_course.order_index = index
        plan_course.priority = index

    db.flush()


def resolve_plan_timezone(profile: UserProfile) -> str:
    return resolve_effective_timezone(profile.timezone)
