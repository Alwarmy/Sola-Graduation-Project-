from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserLearningStateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    dominant_interests: list[str]
    emerging_interests: list[str]
    covered_topics: list[str]
    topic_familiarity: dict
    topic_families: dict
    current_focus: str | None
    preferred_content_type: str | None
    preferred_course_length: str | None
    effective_preferred_language: str | None
    engagement_score: int
    source_profile_snapshot: dict
    source_event_summary: dict
    profile_alignment: dict
    created_at: datetime
    updated_at: datetime
