import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { GET as listGet } from "./route";
import { GET as activeGet } from "./active/route";
import { GET as queueGet } from "./queue/route";
import { GET as detailGet } from "./[planId]/route";
import { GET as readinessGet } from "./[planId]/readiness/route";

/**
 * Post-CP10 hardening — dedicated safe plan GETs strip nested raw
 * CourseResponse fields server-side. Every test scans for the
 * provider/quality leak sentinels.
 *
 * The backend fixtures here ARE the raw snake_case shape (what the
 * backend returns); the handlers must adapt + strip before returning to
 * the browser.
 */

const rawCourse = {
  id: 5,
  source: "youtube",
  external_id: "ext5",
  content_type: "video",
  content_format_label: "Video course",
  title: "Sample course",
  description: null,
  short_description: null,
  provider: "youtube",
  provider_display_name: "YouTube",
  channel_title: null,
  instructor_name: null,
  instructor_display_name: "Telusko",
  language: "en",
  level: null,
  difficulty_level: null,
  difficulty_label: null,
  duration_minutes_total: null,
  duration_is_estimated: false,
  duration_label: null,
  pricing_model: "free",
  pricing_label: "Free",
  is_free: true,
  topic_tags: [],
  topic_tag_labels: [],
  // Internal admin/debug fields the dedicated handler MUST strip:
  provider_metadata: { upstream: "DO_NOT_LEAK_provider_meta" },
  quality_signals: { ai_validated: "DO_NOT_LEAK_quality_signals" },
  quality_score: 88,
  quality_tier: null,
  prerequisite_hint: null,
  progression_hint: null,
  progression_label: null,
  url: null,
  thumbnail_url: null,
  published_at: null,
  created_at: "2026-05-14T09:00:00Z",
  updated_at: "2026-05-14T09:00:00Z",
  card_summary: "Video",
  badges: [],
};

const rawQueueRow = {
  id: 11,
  user_id: 9,
  course_id: 5,
  status: "queued",
  note: null,
  created_at: "2026-05-14T09:00:00Z",
  updated_at: "2026-05-14T09:00:00Z",
  course: rawCourse,
};

const rawPlanCourse = {
  id: 101,
  plan_id: 1,
  course_id: 5,
  priority: 1,
  order_index: 1,
  status: "active",
  rationale: null,
  created_at: "x",
  updated_at: "x",
  course: rawCourse,
};

const rawPlan = {
  id: 1,
  user_id: 9,
  title: "Audit plan",
  goal: "Audit goal",
  status: "active",
  version: 1,
  schedule_revision: 1,
  current_focus_snapshot: null,
  weekly_hours_snapshot: 10,
  schedule_timezone_snapshot: "Asia/Riyadh",
  source_learning_state_snapshot: {},
  plan_summary: {},
  created_at: "x",
  updated_at: "x",
  preference: null,
  courses: [rawPlanCourse],
};

const rawReadiness = {
  plan_id: 1,
  version: 1,
  status: "active",
  schedule_revision: 1,
  is_open_status: true,
  is_active_status: true,
  has_preference: true,
  has_courses: true,
  has_schedule_items: false,
  active_course_count: 1,
  max_active_courses: 3,
  queued_backlog_count: 0,
  base_blockers: [],
  generation_blockers: [],
  execution_blockers: [],
  is_ready_for_schedule_generation: true,
  is_ready_for_force_regeneration: false,
  is_ready_for_execution: false,
  recommended_action: "generate_schedule",
  recommended_recovery_mode: null,
};

const LEAK_SENTINELS = [
  "provider_metadata",
  "quality_signals",
  "DO_NOT_LEAK",
  "access_token",
  "refresh_token",
  "user_id",
];

function assertNoLeak(text: string) {
  for (const sentinel of LEAK_SENTINELS) {
    expect(text, `unexpected leak: ${sentinel}`).not.toContain(sentinel);
  }
}

describe("GET /api/plans (post-CP10 hardening — dedicated safe read)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const spy = stubFetch([]);
    const r = await listGet();
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicLearningPlan[] with NO provider_metadata / quality_signals / user_id", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: [rawPlan, { ...rawPlan, id: 2 }] }]);
    const r = await listGet();
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json).toHaveLength(2);
    expect(json[0].statusLabel).toBe("Active");
    expect(json[0].scheduleRevision).toBe(1);
    assertNoLeak(JSON.stringify(json));
  });
});

describe("GET /api/plans/active (post-CP10 hardening)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const spy = stubFetch([]);
    const r = await activeGet(new NextRequest("http://app.test/api/plans/active"));
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicLearningPlan with stripped course internals", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: rawPlan }]);
    const r = await activeGet(new NextRequest("http://app.test/api/plans/active"));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.id).toBe(1);
    expect(json.courses[0].course.providerDisplayName).toBe("YouTube");
    assertNoLeak(JSON.stringify(json));
  });

  test("backend 404 propagates safely", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([
      {
        status: 404,
        body: { detail: "No active plan", error_code: "not_found", request_id: "req-a-404" },
      },
    ]);
    const r = await activeGet(new NextRequest("http://app.test/api/plans/active"));
    expect(r.status).toBe(404);
  });
});

describe("GET /api/plans/queue (post-CP10 hardening)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const spy = stubFetch([]);
    const r = await queueGet(new NextRequest("http://app.test/api/plans/queue"));
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicQueueItem[] with stripped nested course internals", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: [rawQueueRow] }]);
    const r = await queueGet(new NextRequest("http://app.test/api/plans/queue"));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json).toHaveLength(1);
    expect(json[0].statusLabel).toBe("Queued");
    expect(json[0].course.title).toBe("Sample course");
    assertNoLeak(JSON.stringify(json));
  });
});

describe("GET /api/plans/[planId] (post-CP10 hardening)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const spy = stubFetch([]);
    const r = await detailGet(new NextRequest("http://app.test/api/plans/1"), {
      params: Promise.resolve({ planId: "1" }),
    });
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("non-numeric planId → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await detailGet(new NextRequest("http://app.test/api/plans/abc"), {
      params: Promise.resolve({ planId: "abc" }),
    });
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicLearningPlan with stripped course internals", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: rawPlan }]);
    const r = await detailGet(new NextRequest("http://app.test/api/plans/1"), {
      params: Promise.resolve({ planId: "1" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.statusLabel).toBe("Active");
    expect(json.courses[0].course.providerDisplayName).toBe("YouTube");
    assertNoLeak(JSON.stringify(json));
  });
});

describe("GET /api/plans/[planId]/readiness (post-CP10 hardening)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const spy = stubFetch([]);
    const r = await readinessGet(new NextRequest("http://app.test/api/plans/1/readiness"), {
      params: Promise.resolve({ planId: "1" }),
    });
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicPlanReadiness with labelized blockers + safe state", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: rawReadiness }]);
    const r = await readinessGet(new NextRequest("http://app.test/api/plans/1/readiness"), {
      params: Promise.resolve({ planId: "1" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.isReadyForScheduleGeneration).toBe(true);
    expect(json.recommendedActionLabel).toBe("Generate your schedule");
    assertNoLeak(JSON.stringify(json));
  });
});
