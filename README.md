# SOLA — FastAPI + Next.js learning platform

SOLA is a structured learning platform. Learners discover courses, generate a scheduled study plan, execute it day by day, log progress, and get help from a scoped AI assistant tied to their active plan. The backend serves data and lifecycle; the frontend is the learner-facing UI.

## Repo layout

| Path | Purpose |
|---|---|
| `frontend/` | Next.js 15.1.6 app — see `frontend/README.md` |
| `backend/` | FastAPI service — see `backend/README.md` |

## Prerequisites

- Node.js ≥ 20.0.0
- pnpm 11.1.1
- Python 3.12
- PostgreSQL 15

## Setup

Each subproject has its own README with full setup. Quickstart below. Start the backend first — the frontend depends on it for live data.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Fill DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET, OPENAI_API_KEY, YOUTUBE_API_KEY
alembic upgrade head
uvicorn app.main:app --reload
```

API runs at `http://localhost:8000`. OpenAPI UI at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

App runs at `http://localhost:3010`.

## Testing

### Backend

```bash
cd backend
source .venv/bin/activate
pytest                            # full suite
pytest -m "not integration"       # fast unit-only
pytest -m integration             # Postgres-backed
```

### Frontend

```bash
cd frontend
pnpm test                         # 345 tests across 70 files
pnpm test:watch                   # watch mode
```

## Project layout overview

- **Backend** (`backend/`) — FastAPI + SQLAlchemy + Alembic. 53 routes covering auth, profiles, course discovery, plan lifecycle, scheduling, execution, recovery, and the scoped assistant. Pydantic schemas at the boundary, Alembic for migrations.
- **Frontend** (`frontend/`) — Next.js App Router + React 19 + TypeScript strict mode. React Query owns server state, Zod validates payloads at the boundary, Vitest runs unit tests. Domain feature modules under `src/features/` mirror the backend's domains.

## Status

The frontend ships in 4 blocks:

| Block | Description | Status |
|---|---|---|
| 1 | Foundation Hardening | done |
| 2 | Demo-Ready MVP | pending |
| 3 | Product-Grade Polish | pending |
| 4 | Production Launch | pending |

Backend is feature-complete for the current frontend block and is treated as read-only by the frontend workstream.