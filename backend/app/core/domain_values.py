from __future__ import annotations


LEARNING_PLAN_STATUS_VALUES = (
    "active",
    "paused",
    "archived",
    "completed",
)
OPEN_LEARNING_PLAN_STATUS_VALUES = (
    "active",
    "paused",
)
TERMINAL_LEARNING_PLAN_STATUS_VALUES = (
    "archived",
    "completed",
)

LEARNING_PLAN_ITEM_STATUS_VALUES = (
    "pending",
    "in_progress",
    "completed",
    "skipped",
)

SCHEDULE_QUEUE_STATUS_VALUES = (
    "queued",
    "scheduled",
)

COURSE_STRUCTURE_BUILD_STATUS_VALUES = (
    "pending",
    "built",
    "failed",
)

COURSE_INGESTION_STATUS_VALUES = (
    "pending",
    "success",
    "failed",
)

ASSISTANT_CONVERSATION_STATUS_VALUES = (
    "active",
    "archived",
)

ASSISTANT_MEMORY_SCOPE_VALUES = (
    "durable_preference",
    "temporary_constraint",
    "learning_signal",
)

ASSISTANT_MEMORY_STATUS_VALUES = (
    "proposed",
    "confirmed",
    "active",
    "dismissed",
    "expired",
)

ASSISTANT_ACTION_STATUS_VALUES = (
    "proposed",
    "confirmed",
    "executed",
    "failed",
    "dismissed",
)

ASSISTANT_ACTION_TYPE_VALUES = (
    "review_active_plan_adjustment_options",
    "review_plan_recovery_options",
    "apply_recommended_recovery",
    "pause_active_plan",
    "resume_active_plan",
    "queue_top_recommendation",
)


def sql_string_list(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{value}'" for value in values) + ")"
