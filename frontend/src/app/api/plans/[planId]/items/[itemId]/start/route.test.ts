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

const actionResult = {
  item: {
    id: 301,
    plan_id: 199,
    plan_course_id: 315,
    course_id: 2,
    course_unit_id: 41,
    title: "Variables",
    item_type: "video_segment",
    status: "in_progress",
    version: 2,
    schedule_order_index: 0,
    source_order_index: 0,
    scheduled_date: "2026-05-14",
    time_window: "evening",
    planned_minutes: 30,
    actual_started_at: "2026-05-14T18:00:00Z",
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
    is_due_today: true,
    is_overdue: false,
    is_actionable: false,
    item_metadata: {},
    created_at: "2026-05-13T08:00:00Z",
    updated_at: "2026-05-13T08:00:00Z",
    course: { id: 2, title: "Python", provider: "youtube", provider_display_name: "YouTube", language: "en", url: null },
    course_unit: { id: 41, title: "Variables", estimated_minutes: 30, source_order_index: 0 },
  },
  execution_summary: {
    plan_id: 199,
    plan_status: "active",
    schedule_timezone_snapshot: "Asia/Riyadh",
    total_items: 4,
    pending_items_count: 3,
    in_progress_items_count: 1,
    completed_items_count: 0,
    skipped_items_count: 0,
    overdue_items_count: 0,
    due_today_items_count: 1,
    completion_rate: 0,
    is_plan_finished: false,
    can_mark_completed: false,
    next_actionable_item_id: 302,
    next_actionable_scheduled_date: "2026-05-15",
    next_actionable_title: "Loops",
  },
};

describe("POST /api/plans/[planId]/items/[itemId]/start (CP8 — header concurrency)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  function req(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest("http://app.test/api/plans/199/items/301/start", {
      method: "POST",
      headers,
    });
  }

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await POST(req({ "x-expected-version": "1" }), {
      params: Promise.resolve({ planId: "199", itemId: "301" }),
    });
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("missing X-Expected-Version → 422 without calling backend", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await POST(req(), {
      params: Promise.resolve({ planId: "199", itemId: "301" }),
    });
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test.each([["0"], ["-1"], ["1.5"], ["abc"]])(
    "invalid X-Expected-Version %s → 422",
    async (bad) => {
      jar._store.set("sola_access", { value: "ACC", options: {} });
      const spy = stubFetch([]);
      const r = await POST(req({ "x-expected-version": bad }), {
        params: Promise.resolve({ planId: "199", itemId: "301" }),
      });
      expect(r.status).toBe(422);
      expect(spy).not.toHaveBeenCalled();
    },
  );

  test("forwards header verbatim and returns PublicPlanItemActionResult", async () => {
    jar._store.set("sola_access", { value: "ACC_S", options: {} });
    const spy = stubFetch([{ status: 200, body: actionResult, headers: { "x-request-id": "req-s" } }]);
    const r = await POST(req({ "x-expected-version": "1" }), {
      params: Promise.resolve({ planId: "199", itemId: "301" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.item.id).toBe(301);
    expect(json.item.statusLabel).toBe("In progress");
    expect(json.executionSummary.totalItems).toBe(4);

    const init = spy.mock.calls[0]![1] as unknown as { headers: Record<string, string> };
    expect(String(spy.mock.calls[0]![0])).toContain("/plans/199/items/301/start");
    expect(init.headers["X-Expected-Version"]).toBe("1");
    expect(init.headers.authorization).toBe("Bearer ACC_S");
  });

  test("backend 412 stale propagates safe envelope", async () => {
    jar._store.set("sola_access", { value: "ACC_S", options: {} });
    stubFetch([
      {
        status: 412,
        body: {
          detail: "stale",
          error_code: "expected_version_mismatch",
          request_id: "req-s-stale",
        },
        headers: { "x-request-id": "req-s-stale" },
      },
    ]);
    const r = await POST(req({ "x-expected-version": "99" }), {
      params: Promise.resolve({ planId: "199", itemId: "301" }),
    });
    expect(r.status).toBe(412);
    const json = await r.json();
    expect(json.error_code).toBe("expected_version_mismatch");
  });
});
