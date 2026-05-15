from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


USER_EVENT_TYPES = {
    "onboarding_completed",
    "search_performed",
    "recommendation_viewed",
    "recommendation_clicked",
    "course_opened",
    "course_saved",
    "course_selected",
    "course_dismissed",
    "plan_created",
    "plan_item_started",
    "plan_item_completed",
    "plan_item_delayed",
    "plan_item_skipped",
    "chat_message_sent",
    "profile_updated",
    "assistant_memory_signal_confirmed",
    "assistant_memory_signal_superseded",
    "assistant_memory_signal_expired",
    "assistant_action_executed",
}


class UserEventCreate(BaseModel):
    event_type: str
    event_payload: dict = Field(default_factory=dict)


class UserEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    event_type: str
    event_payload: dict
    created_at: datetime
