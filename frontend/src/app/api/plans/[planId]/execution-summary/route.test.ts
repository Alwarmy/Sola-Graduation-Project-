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

const summary = {
  plan_id: 199,
  plan_status: "active",
  schedule_timezone_snapshot: "Asia/Riyadh",
  total_items: 12,
  pending_items_count: 8,
  in_progress_items_count: 1,
  completed_items_count: 3,
  skipped_items_count: 0,
  overdue_items_count: 1,
  due_today_items_count: 2,
  completion_rate: 0.25,
  is_plan_finished: false,
  can_mark_completed: false,
  next_actionable_item_id: 302,
  next_actionable_scheduled_date: "2026-05-15",
  next_actionable_title: "Loops",
};

describe("GET /api/plans/[planId]/execution-summary (CP8)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await GET(new NextRequest("http://app.test/api/plans/199/execution-summary"), {
      params: Promise.resolve({ planId: "199" }),
    });
    expect(r.status).toBe(401);
  });

  test("returns PublicExecutionSummary with safe completion-rate label", async () => {
    jar._store.set("sola_access", { value: "ACC_SM", options: {} });
    stubFetch([{ status: 200, body: summary, headers: { "x-request-id": "req-sm" } }]);
    const r = await GET(new NextRequest("http://app.test/api/plans/199/execution-summary"), {
      params: Promise.resolve({ planId: "199" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.totalItems).toBe(12);
    expect(json.completedItemsCount).toBe(3);
    expect(json.completionRateLabel).toBe("25%");
    expect(json.planStatusLabel).toBe("Active");
    expect(r.headers.get("x-request-id")).toBe("req-sm");
  });

  test("non-numeric planId → 422", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await GET(new NextRequest("http://app.test/api/plans/abc/execution-summary"), {
      params: Promise.resolve({ planId: "abc" }),
    });
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });
});
