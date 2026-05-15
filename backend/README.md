# SOLA — Backend

FastAPI service powering SOLA. Owns user identity, the course catalog, plan generation and lifecycle, scheduling, execution tracking, recovery flows, and the scoped AI assistant.

## What it does

| Domain | Capability |
|---|---|
| Auth | registration, login, refresh tokens, JWT-signed sessions |
| Profile | user profile data and preferences |
| Courses | catalog, search, course detail, YouTube enrichment |
| Plans | generate, edit, activate, archive learning plans |
| Schedule | daily/weekly schedule derived from the active plan |
| Execution | log sessions, mark progress, complete or skip items |
| Recovery | detect stalled plans and propose adjustments |
| Assistant | OpenAI-backed chat scoped to the learner's active plan |

## Tech stack

- FastAPI 0.109.0
- SQLAlchemy 2.0.25
- Alembic 1.13.1 (migrations)
- Pydantic 2.5.3
- PostgreSQL 15
- Python 3.12

## Prerequisites

- Python 3.12
- PostgreSQL 15 running locally or reachable via `DATABASE_URL`
- Environment file: copy `.env.example` to `.env` and fill in values

## Setup

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Required: DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET, OPENAI_API_KEY, YOUTUBE_API_KEY
alembic upgrade head
```

## Run

```bash
uvicorn app.main:app --reload
```

Default port `8000`. Override with `--port`.

Once running:

| Endpoint | Purpose |
|---|---|
| `GET /` | service heartbeat |
| `GET /health/db` | database connectivity check |
| `/docs` | Swagger UI |
| `/redoc` | ReDoc UI |
| `/openapi.json` | OpenAPI schema |

## Scripts

| Command | Purpose |
|---|---|
| `uvicorn app.main:app` | start the API server |
| `alembic upgrade head` | apply migrations |
| `alembic revision --autogenerate -m "<message>"` | create a new migration |
| `pytest` | run all tests |
| `pytest -m "not integration"` | fast unit-only suite |
| `pytest -m integration` | Postgres-backed integration suite |

## Testing

```bash
# All tests
pytest

# Verbose
pytest -v

# A single file
pytest tests/path/to/test_file.py

# A single test
pytest tests/path/to/test_file.py::test_name
```

Tests live under `tests/`. 21 test files at last count, split into unit and integration suites via pytest markers.

## Structure

```
app/
  api/        # route handlers grouped by domain
  core/       # config, security, shared dependencies
  db/         # session, base, init
  models/     # SQLAlchemy ORM models
  schemas/    # Pydantic request/response schemas
  services/   # business logic per domain
  main.py     # FastAPI app factory
tests/        # pytest suites (unit + integration)
alembic/      # migration revisions
scripts/      # operational scripts
```

## Status

53 routes. Feature-complete for the current frontend block. Source files are treated as read-only by the frontend workstream.