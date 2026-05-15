import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { POST } from "./route";

const itemFixture = {
  id: 301,
  plan_id: 199,
  plan_course_id: 315,
  course_id: 2,
  course_unit_id: 41,
  title: "Variables",
  item_type: "video_segment",
  status: "pending",
  version: 1,
  schedule_order_index: 0,
  source_order_index: 0,
  scheduled_date: "2026-05-14",
  time_window: "evening",
  planned_minutes: 30,
  actual_started_at: null,
  actual_completed_at: null,
  actual_minutes: null,
  skipped_at: null,
  skip_reason: null,
  segment_index: 0,
  segment_start_second: 0,
  segment_end_second: 1800,
  practical_signal: "balanced",
  load_signal: "moderate",
  schedule_timezone_snapshot: "Asia/Riyadh",
  is_due_today: false,
  is_overdue: false,
  is_actionable: true,
  item_metadata: { internal_debug: "LEAK_internal" },
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
  course: { id: 2, title: "Python", provider: "youtube", provider_display_name: "YouTube", language: "en", url: null, provider_metadata: { api_key: "LEAK_apikey" } },
  course_unit: { id: 41, title: "Variables", estimated_minutes: 30, source_order_index: 0 },
};

const okBody = {
  plan_id: 199,
  plan_version: 6,
  schedule_revision: 2,
  total_items: 1,
  total_minutes: 30,
  scheduled_start_date: "2026-05-14",
  scheduled_end_date: "2026-05-20",
  items: [itemFixture],
};

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/plans/[planId]/schedule/generate (CP8)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await POST(
      jsonReq("http://app.test/api/plans/199/schedule/generate", {
        expected_version: 5,
        force_rebuild: false,
      }),
      { params: Promise.resolve({ planId: "199" }) },
    );
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("non-numeric planId → 422", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await POST(jsonReq("http://app.test/api/plans/abc/schedule/generate", {}), {
      params: Promise.resolve({ planId: "abc" }),
    });
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("missing expected_version → 422 without calling backend", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    for (const bad of [{}, { expected_version: 0 }, { expected_version: -1 }, { force_rebuild: true }]) {
      const r = await POST(jsonReq("http://app.test/api/plans/199/schedule/generate", bad), {
        params: Promise.resolve({ planId: "199" }),
      });
      expect(r.status).toBe(422);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards body + bearer; returns PublicScheduleGenerationResult with no raw leaks", async () => {
    jar._store.set("sola_access", { value: "ACC_SG", options: {} });
    const spy = stubFetch([{ status: 200, body: okBody, headers: { "x-request-id": "req-sg-1" } }]);
    const r = await POST(
      jsonReq("http://app.test/api/plans/199/schedule/generate", {
        expected_version: 5,
        expected_schedule_revision: 1,
        force_rebuild: true,
      }),
      { params: Promise.resolve({ planId: "199" }) },
    );
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.planVersion).toBe(6);
    expect(json.scheduleRevision).toBe(2);
    expect(json.items[0].id).toBe(301);

    // Backend got the exact body + bearer.
    const init = spy.mock.calls[0]![1] as unknown as { headers: Record<string, string>; body: string };
    expect(String(spy.mock.calls[0]![0])).toContain("/plans/199/schedule/generate");
    expect(init.headers.authorization).toBe("Bearer ACC_SG");
    const sent = JSON.parse(init.body);
    expect(sent.expected_version).toBe(5);
    expect(sent.expected_schedule_revision).toBe(1);
    expect(sent.force_rebuild).toBe(true);

    // No raw leaks in the response body returned to the browser.
    const text = JSON.stringify(json);
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("item_metadata");
    expect(text).not.toContain("provider_metadata");
    expect(text).not.toContain("api_key");
    expect(text).not.toContain("LEAK_");
  });

  test("backend 412 stale → safe envelope with request_id preserved", async () => {
    jar._store.set("sola_access", { value: "ACC_SG", options: {} });
    stubFetch([
      {
        status: 412,
        body: {
          detail: "learning_plan version is stale.",
          error_code: "precondition_failed",
          request_id: "req-sg-stale",
        },
        headers: { "x-request-id": "req-sg-stale" },
      },
    ]);
    const r = await POST(
      jsonReq("http://app.test/api/plans/199/schedule/generate", {
        expected_version: 1,
        force_rebuild: false,
      }),
      { params: Promise.resolve({ planId: "199" }) },
    );
    expect(r.status).toBe(412);
    const json = await r.json();
    expect(json.error_code).toBe("precondition_failed");
    expect(r.headers.get("x-request-id")).toBe("req-sg-stale");
  });
});
