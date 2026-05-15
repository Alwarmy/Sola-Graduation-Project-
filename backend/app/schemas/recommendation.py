from pydantic import BaseModel, Field

from app.schemas.course import CourseCardResponse


class RecommendationCourseResponse(CourseCardResponse):
    pass


class RecommendationListResponse(BaseModel):
    total: int
    items: list[RecommendationCourseResponse] = Field(default_factory=list)
