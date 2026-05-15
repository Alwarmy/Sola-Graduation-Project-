from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.course import CourseResponse


class CourseUnitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_structure_id: int
    external_unit_id: str | None
    unit_type: str
    title: str
    description: str | None
    source_order_index: int
    raw_duration_seconds: int
    estimated_minutes: int
    start_second: int | None
    end_second: int | None
    practical_signal: str
    load_signal: str
    source_metadata: dict
    created_at: datetime
    updated_at: datetime


class CourseStructureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    source: str
    content_type: str
    structure_type: str
    build_status: str
    total_units: int
    total_minutes: int
    structure_metadata: dict
    build_notes: str | None
    last_built_at: datetime | None
    created_at: datetime
    updated_at: datetime
    course: CourseResponse
    units: list[CourseUnitResponse] = Field(default_factory=list)
