from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.course import CourseResponse


class ScheduleQueueAddRequest(BaseModel):
    note: str | None = None


class ScheduleQueueItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    course_id: int
    status: str
    note: str | None
    created_at: datetime
    updated_at: datetime
    course: CourseResponse
