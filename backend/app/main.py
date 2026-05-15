from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.assistant import router as assistant_router
from app.api.auth import router as auth_router
from app.api.course_structures import router as course_structures_router
from app.api.courses import router as courses_router
from app.api.error_handlers import register_exception_handlers
from app.api.middleware import register_request_context_middleware
from app.api.plan_execution import router as plan_execution_router
from app.api.plan_recovery import router as plan_recovery_router
from app.api.plan_schedule import router as plan_schedule_router
from app.api.plans import router as plans_router
from app.api.recommendations import router as recommendations_router
from app.api.user_events import router as user_events_router
from app.api.user_learning_state import router as user_learning_state_router
from app.api.user_profiles import router as user_profiles_router
from app.core.config import get_settings
from app.db.session import configure_session_factory, new_session


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    settings.validate_startup_settings()
    configure_session_factory()
    yield


app = FastAPI(
    title="SOLA Backend",
    version="1.0.0",
    description=(
        "Backend API for SOLA learning discovery, ingestion, personalization, "
        "planning, scheduling, execution, recovery, course structure intelligence, and assistant guidance."
    ),
    lifespan=lifespan,
)
register_request_context_middleware(app)
register_exception_handlers(app)


@app.get("/")
def root():
    return {"message": "SOLA backend is running"}


@app.get("/health/db")
def check_database_connection():
    db: Session = new_session()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "database connected"}
    finally:
        db.close()


app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(course_structures_router)
app.include_router(user_profiles_router)
app.include_router(user_events_router)
app.include_router(user_learning_state_router)
app.include_router(recommendations_router)
app.include_router(plans_router)
app.include_router(plan_schedule_router)
app.include_router(plan_execution_router)
app.include_router(plan_recovery_router)
app.include_router(assistant_router)
