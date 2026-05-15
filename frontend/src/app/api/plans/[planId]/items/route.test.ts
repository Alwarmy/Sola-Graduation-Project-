import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { GET } from "./route";

const item = {
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
  is_actionable: true,
  item_metadata: { internal_only: "LEAK_metadata" },
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
  course: {
    id: 2,
    title: "Python",
    provider: "youtube",
    provider_display_name: "YouTube",
    language: "en",
    url: null,
    provider_metadata: { api_key: "LEAK_apikey" },
  },
  course_unit: { id: 41, title: "Variables", estimated_minutes: 30, source_order_index: 0 },
};

describe("GET /api/plans/[planId]/items (CP8)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const spy = stubFetch([]);
    const r = await GET(new NextRequest("http://app.test/api/plans/199/items"), {
      params: Promise.resolve({ planId: "199" }),
    });
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards query params and returns array of PublicPlanItem (no raw leaks)", async () => {
    jar._store.set("sola_access", { value: "ACC_I", options: {} });
    const spy = stubFetch([{ status: 200, body: [item], headers: { "x-request-id": "req-i" } }]);
    const r = await GET(
      new NextRequest("http://app.test/api/plans/199/items?status_filter=in_progress&actionable_only=true"),
      { params: Promise.resolve({ planId: "199" }) },
    );
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].id).toBe(301);
    expect(json[0].statusLabel).toBe("In progress");
    expect(json[0].timeWindowLabel).toBe("Evening");
    expect(json[0].course.providerDisplayName).toBe("YouTube");

    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain("/plans/199/items");
    expect(url).toContain("status_filter=in_progress");
    expect(url).toContain("actionable_only=true");

    const text = JSON.stringify(json);
    expect(text).not.toContain("item_metadata");
    expect(text).not.toContain("provider_metadata");
    expect(text).not.toContain("api_key");
    expect(text).not.toContain("practical_signal");
    expect(text).not.toContain("load_signal");
    expect(text).not.toContain("LEAK_");
  });

  test("backend 404 surfaces as safe envelope", async () => {
    jar._store.set("sola_access", { value: "ACC_I", options: {} });
    stubFetch([
      {
        status: 404,
        body: { detail: "Not found", error_code: "not_found", request_id: "req-i-404" },
      },
    ]);
    const r = await GET(new NextRequest("http://app.test/api/plans/9999/items"), {
      params: Promise.resolve({ planId: "9999" }),
    });
    expect(r.status).toBe(404);
  });
});
