from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


BACKGROUND_TRACK_OPTIONS = {
    "software_engineering",
    "web_development",
    "mobile_development",
    "data_science",
    "ai_ml",
    "cybersecurity",
    "accounting",
    "economics",
    "finance",
    "business",
    "marketing",
    "design",
    "physics",
    "mathematics",
    "medicine",
    "law",
    "education",
    "other",
}

TRACK_OPTIONS = BACKGROUND_TRACK_OPTIONS

EXPERIENCE_LEVEL_OPTIONS = {
    "beginner",
    "intermediate",
    "advanced",
}

EMPLOYMENT_STATUS_OPTIONS = {
    "employed",
    "unemployed",
    "job_seeker",
}

GOAL_OPTIONS = {
    "job",
    "freelance",
    "academic",
    "project",
    "skill_growth",
    "general",
}

PREFERRED_LANGUAGE_OPTIONS = {
    "ar",
    "en",
    "any",
}


class UserProfileBase(BaseModel):
    background_track: str

    primary_track: str | None = None
    secondary_tracks: list[str] = Field(default_factory=list)

    target_role: str | None = Field(default=None, max_length=120)
    experience_level: str | None = None

    employment_status: str
    is_student: bool

    education_major: str | None = None
    weekly_hours: int = Field(..., ge=1, le=80)

    goal: str
    preferred_language: str

    bio: str | None = None
    timezone: str | None = None


class UserProfileCreate(UserProfileBase):
    pass


class UserProfileUpdate(UserProfileBase):
    pass


class UserProfileResponse(UserProfileBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    timezone: str
    created_at: datetime
    updated_at: datetime