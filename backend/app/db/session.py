from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
)

_engine: Engine | None = None


def configure_session_factory() -> Engine:
    global _engine

    if _engine is not None:
        return _engine

    settings = get_settings()
    database_url = settings.database_url_required()

    _engine = create_engine(
        database_url,
        pool_pre_ping=True,
    )
    SessionLocal.configure(bind=_engine)
    return _engine


def get_engine() -> Engine:
    return configure_session_factory()


def get_session_factory() -> sessionmaker:
    configure_session_factory()
    return SessionLocal


def new_session() -> Session:
    return get_session_factory()()


def get_db() -> Generator[Session, None, None]:
    db = new_session()
    try:
        yield db
    finally:
        db.close()