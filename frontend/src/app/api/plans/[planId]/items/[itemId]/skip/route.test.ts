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

const minimalActionResult = {
  item: {
    id: 301,
    plan_id: 199,
    plan_course_id: 315,
    course_id: 2,
    course_unit_id: 41,
    title: "Variables",
    item_type: "video_segment",
    status: "skipped",
    version: 3,
    schedule_order_index: 0,
    source_order_index: 0,
    scheduled_date: "2026-05-14",
    time_window: "evening",
    planned_minutes: 30,
    actual_started_at: null,
    actual_completed_at: null,
    actual_minutes: null,
    skipped_at: "2026-05-14T19:00:00Z",
    skip_reason: "Holiday",
    segment_index: 0,
    segment_start_second: 0,
    segment_end_second: 1800,
    practical_signal: "balanced",
    load_signal: "moderate",
    schedule_timezone_snapshot: "Asia/Riyadh",
    is_due_today: false,
    is_overdue: false,
    is_actionable: false,
    item_metadata: {},
    created_at: "2026-05-13T08:00:00Z",
    updated_at: "2026-05-14T19:00:00Z",
    course: { id: 2, title: "Python", provider: "youtube", provider_display_name: "YouTube", language: "en", url: null },
    course_unit: { id: 41, title: "Variables", estimated_minutes: 30, source_order_index: 0 },
  },
  execution_summary: {
    plan_id: 199,
    plan_status: "active",
    schedule_timezone_snapshot: "Asia/Riyadh",
    total_items: 4,
    pending_items_count: 2,
    in_progress_items_count: 1,
    completed_items_count: 0,
    skipped_items_count: 1,
    overdue_items_count: 0,
    due_today_items_count: 0,
    completion_rate: 0,
    is_plan_finished: false,
    can_mark_completed: false,
    next_actionable_item_id: null,
    next_actionable_scheduled_date: null,
    next_actionable_title: null,
  },
};

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("http://app.test/api/plans/199/items/301/skip", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/plans/[planId]/items/[itemId]/skip (CP8)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await POST(jsonReq({ expected_version: 2 }), {
      params: Promise.resolve({ planId: "199", itemId: "301" }),
    });
    expect(r.status).toBe(401);
  });

  test("missing expected_version → 422", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await POST(jsonReq({ skip_reason: "Holiday" }), {
      params: Promise.resolve({ planId: "199", itemId: "301" }),
    });
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards body with skip_reason", async () => {
    jar._store.set("sola_access", { value: "ACC_SK", options: {} });
    const spy = stubFetch([{ status: 200, body: minimalActionResult }]);
    const r = await POST(jsonReq({ expected_version: 2, skip_reason: "Holiday" }), {
      params: Promise.resolve({ planId: "199", itemId: "301" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.item.status).toBe("skipped");

    const init = spy.mock.calls[0]![1] as unknown as { headers: Record<string, string>; body: string };
    const sent = JSON.parse(init.body);
    expect(sent.expected_version).toBe(2);
    expect(sent.skip_reason).toBe("Holiday");
    expect(init.headers.authorization).toBe("Bearer ACC_SK");
  });
});
