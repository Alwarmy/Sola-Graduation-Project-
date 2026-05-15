# SOLA — Frontend

Next.js 15.1.6 + React 19.0.0 frontend for SOLA. Learner-facing UI for discovering courses, generating and running study plans, tracking progress, and conversing with the scoped assistant.

## What it does

User journeys, one feature module per domain under `src/features/`:

| Module | What the user does |
|---|---|
| `auth` | sign in, register, refresh session, log out |
| `courses` | browse the catalog, search, view a course, enroll |
| `plans` | generate a plan from a course, edit, activate, archive |
| `progress` | see today's schedule, log sessions, mark items complete |
| `assistant` | chat with an AI scoped to the active plan |
| `profile` | view and edit profile and preferences |

Server data flows through React Query against the backend via the same-origin proxy at `/api/sola/[...path]`. Zod validates every payload at the boundary.

## Tech stack

- Next.js 15.1.6 (App Router)
- React 19.0.0
- TypeScript 5.7.3 (strict mode)
- pnpm 11.1.1
- React Query (TanStack Query) 5.62.7 — server state
- Zod 3.24.1 — runtime validation
- Vitest — unit tests
- ESLint + Prettier

## Prerequisites

- Node.js ≥ 20.0.0
- pnpm 11.1.1

## Setup

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local — see the file for the full variable list
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | start dev server on port 3010 |
| `pnpm build` | production build |
| `pnpm start` | run production build locally |
| `pnpm lint` | run eslint |
| `pnpm typecheck` | run `tsc --noEmit` |
| `pnpm format` | run prettier |
| `pnpm format:check` | check prettier formatting |
| `pnpm test` | run vitest (single run) |
| `pnpm test:watch` | run vitest in watch mode |

## Testing

```bash
# All tests, single run
pnpm test

# Watch mode
pnpm test:watch
```

Tests live next to source under `src/` (`*.test.ts(x)` / `*.spec.ts(x)`). 345 tests across 70 files at last count.

## Structure

```
src/
  app/             # Next.js App Router — pages, layouts, route handlers
  components/      # shared UI primitives (Button, Pill, Badge, Toast, etc.)
  features/        # domain modules — one folder per backend domain
  lib/             # contracts, query keys, formatters, env, errors, routes
  test/            # vitest setup, helpers, react-query wrapper
```

## Status

Build plan: 4 blocks.

| Block | Description | Status |
|---|---|---|
| 1 | Foundation Hardening | done |
| 2 | Demo-Ready MVP | pending |
| 3 | Product-Grade Polish | pending |
| 4 | Production Launch | pending |