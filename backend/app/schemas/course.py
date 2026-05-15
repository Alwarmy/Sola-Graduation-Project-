from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


COURSE_DIFFICULTY_LEVEL_OPTIONS = {
    "beginner",
    "intermediate",
    "advanced",
}

COURSE_PRICING_MODEL_OPTIONS = {
    "free",
    "paid",
    "subscription",
    "unknown",
}

COURSE_PROGRESSION_HINT_OPTIONS = {
    "foundation",
    "next_step",
    "specialization",
}

COURSE_QUALITY_TIER_OPTIONS = {
    "high",
    "strong",
    "standard",
    "developing",
}

COURSE_SEARCH_SORT_OPTIONS = {
    "relevance",
    "personalized",
    "quality",
    "newest",
    "published",
    "duration_short",
    "duration_long",
}

CourseSearchSortBy = Literal[
    "relevance",
    "personalized",
    "quality",
    "newest",
    "published",
    "duration_short",
    "duration_long",
]


class CourseIngestRequest(BaseModel):
    query: str
    max_results_per_type: int = 10


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    external_id: str
    content_type: str

    title: str
    description: str | None

    provider: str
    channel_title: str | None
    instructor_name: str | None

    language: str | None
    level: str | None
    difficulty_level: str | None

    duration_minutes_total: int | None
    duration_is_estimated: bool

    pricing_model: str

    topic_tags: list[str] = Field(default_factory=list)
    quality_score: int | None
    quality_signals: dict[str, Any] = Field(default_factory=dict)

    prerequisite_hint: str | None
    progression_hint: str | None

    provider_metadata: dict[str, Any] = Field(default_factory=dict)

    url: str | None
    thumbnail_url: str | None

    published_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CourseCardBadgeResponse(BaseModel):
    key: str
    label: str
    tone: str


class CourseCardPersonalizationResponse(BaseModel):
    fit_label: str | None
    fit_score: float
    matched_focus: str | None
    fit_reason: str | None
    reason_codes: list[str] = Field(default_factory=list)
    why_now: list[str] = Field(default_factory=list)
    matched_topics: list[str] = Field(default_factory=list)
    covered_topic_overlap: list[str] = Field(default_factory=list)
    score_breakdown: dict[str, float] = Field(default_factory=dict)
    history_details: dict[str, Any] = Field(default_factory=dict)
    profile_alignment: dict[str, Any] = Field(default_factory=dict)


class CourseCardDiscoveryResponse(BaseModel):
    ranking_mode: str
    ranking_score: float
    query_relevance_score: float
    personalization_score: float
    query_match_strength: str
    explanation_label: str
    explanation_summary: str | None
    matched_query_tokens: list[str] = Field(default_factory=list)
    matched_query_topics: list[str] = Field(default_factory=list)
    ranking_reasons: list[str] = Field(default_factory=list)
    personalization_applied: bool = False


class CourseCardResponse(BaseModel):
    id: int
    source: str
    external_id: str
    content_type: str
    content_format_label: str

    title: str
    description: str | None
    short_description: str | None

    provider: str
    provider_display_name: str
    channel_title: str | None
    instructor_name: str | None
    instructor_display_name: str | None

    language: str | None
    level: str | None
    difficulty_level: str | None
    difficulty_label: str | None

    duration_minutes_total: int | None
    duration_is_estimated: bool
    duration_label: str | None

    pricing_model: str
    pricing_label: str
    is_free: bool

    topic_tags: list[str] = Field(default_factory=list)
    topic_tag_labels: list[str] = Field(default_factory=list)

    quality_score: int | None
    quality_tier: str | None
    quality_signals: dict[str, Any] = Field(default_factory=dict)

    prerequisite_hint: str | None
    progression_hint: str | None
    progression_label: str | None

    provider_metadata: dict[str, Any] = Field(default_factory=dict)

    url: str | None
    thumbnail_url: str | None

    published_at: datetime | None
    created_at: datetime
    updated_at: datetime

    card_summary: str
    badges: list[CourseCardBadgeResponse] = Field(default_factory=list)
    personalization: CourseCardPersonalizationResponse | None = None
    discovery: CourseCardDiscoveryResponse | None = None


class CourseSearchFacetBucketResponse(BaseModel):
    value: str
    label: str
    count: int
    is_selected: bool = False


class CourseSearchFacetsResponse(BaseModel):
    languages: list[CourseSearchFacetBucketResponse] = Field(default_factory=list)
    content_types: list[CourseSearchFacetBucketResponse] = Field(default_factory=list)
    difficulty_levels: list[CourseSearchFacetBucketResponse] = Field(default_factory=list)
    pricing_models: list[CourseSearchFacetBucketResponse] = Field(default_factory=list)
    progression_hints: list[CourseSearchFacetBucketResponse] = Field(default_factory=list)
    topic_tags: list[CourseSearchFacetBucketResponse] = Field(default_factory=list)


class CourseSearchAppliedFiltersResponse(BaseModel):
    q: str | None = None
    language: str | None = None
    content_type: str | None = None
    source: str | None = None
    difficulty_level: str | None = None
    pricing_model: str | None = None
    progression_hint: str | None = None
    topic_tag: str | None = None
    sort_by: CourseSearchSortBy
    limit: int
    offset: int


class CourseSearchMetadataResponse(BaseModel):
    total: int
    returned_count: int
    limit: int
    offset: int
    has_more: bool
    sort_by: CourseSearchSortBy
    ranking_mode: str
    query_text: str | None = None
    query_tokens: list[str] = Field(default_factory=list)
    query_topics: list[str] = Field(default_factory=list)
    query_difficulty_hint: str | None = None
    query_progression_hint: str | None = None
    personalization_enabled: bool = False
    personalized_result_count: int = 0
    explanation_result_count: int = 0
    active_focus: str | None = None
    primary_track: str | None = None
    experience_level: str | None = None


class CourseSearchResponse(BaseModel):
    items: list[CourseCardResponse] = Field(default_factory=list)
    metadata: CourseSearchMetadataResponse
    facets: CourseSearchFacetsResponse
    applied_filters: CourseSearchAppliedFiltersResponse


class CourseIngestResponse(BaseModel):
    ingestion_id: int
    total_raw_items: int
    total_promoted_courses: int
    courses: list[CourseCardResponse]


class CourseIngestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    source: str
    query: str
    status: str
    notes: str | None
    created_at: datetime


class RawCourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ingestion_id: int
    source: str
    external_id: str
    content_type: str
    normalized_title: str | None
    channel_title: str | None
    language: str | None
    is_processed: bool
    is_accepted: bool | None
    rejection_reason: str | None
    published_at: datetime | None
    raw_data: dict