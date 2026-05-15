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

const recoveryResult = {
  plan_id: 199,
  plan_version: 6,
  schedule_revision: 3,
  recovery_mode: "rebalance",
  recovery_note: "moved evening session",
  rebuilt_pending_items_count: 4,
  preserved_completed_items_count: 3,
  preserved_skipped_items_count: 0,
  preserved_in_progress_items_count: 1,
  new_scheduled_start_date: "2026-05-15",
  new_scheduled_end_date: "2026-05-22",
  recovery_preview_before: {
    plan_id: 199,
    plan_version: 5,
    plan_status: "active",
    schedule_timezone_snapshot: "Asia/Riyadh",
    schedule_revision: 2,
    missed_study_slots_count: 1,
    overdue_items_count: 1,
    overdue_minutes: 30,
    due_today_items_count: 2,
    remaining_pending_items_count: 8,
    remaining_pending_minutes: 240,
    in_progress_items_count: 1,
    available_capacity_next_7_study_slots_minutes: 420,
    recovery_pressure_ratio: 0.57,
    drift_level: "moderate_drift",
    needs_recovery: true,
    current_schedule_still_viable: false,
    can_recover_without_rebuild: true,
    should_offer_rebuild: false,
    recommended_action: "stay_on_track",
    recommended_recovery_mode: "rebalance",
    available_actions: ["stay_on_track", "rebuild"],
    available_recovery_modes: ["rebalance"],
  },
  execution_summary_after: {},
};

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("http://app.test/api/plans/199/recover", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/plans/[planId]/recover (CP8 — body version + schedule revision)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await POST(
      jsonReq({ mode: "rebalance", expected_version: 5, expected_schedule_revision: 2 }),
      { params: Promise.resolve({ planId: "199" }) },
    );
    expect(r.status).toBe(401);
  });

  test("missing either expected_version OR expected_schedule_revision → 422", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    for (const bad of [
      { mode: "rebalance" },
      { mode: "rebalance", expected_version: 5 },
      { mode: "rebalance", expected_schedule_revision: 2 },
      { expected_version: 5, expected_schedule_revision: 2 }, // missing mode
      { mode: "rebalance", expected_version: 0, expected_schedule_revision: 2 },
      { mode: "rebalance", expected_version: 5, expected_schedule_revision: 0 },
    ]) {
      const r = await POST(jsonReq(bad), { params: Promise.resolve({ planId: "199" }) });
      expect(r.status).toBe(422);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards body verbatim and returns PublicRecoveryResult (no raw leaks)", async () => {
    jar._store.set("sola_access", { value: "ACC_R", options: {} });
    const spy = stubFetch([{ status: 200, body: recoveryResult }]);
    const r = await POST(
      jsonReq({
        mode: "rebalance",
        expected_version: 5,
        expected_schedule_revision: 2,
        recovery_note: "moved evening session",
      }),
      { params: Promise.resolve({ planId: "199" }) },
    );
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.recoveryMode).toBe("rebalance");
    expect(json.recoveryModeLabel).toBe("Rebalance the schedule");
    expect(json.scheduleRevision).toBe(3);
    expect(json.rebuiltPendingItemsCount).toBe(4);

    const init = spy.mock.calls[0]![1] as unknown as { headers: Record<string, string>; body: string };
    expect(String(spy.mock.calls[0]![0])).toContain("/plans/199/recover");
    expect(init.headers.authorization).toBe("Bearer ACC_R");
    const sent = JSON.parse(init.body);
    expect(sent.mode).toBe("rebalance");
    expect(sent.expected_version).toBe(5);
    expect(sent.expected_schedule_revision).toBe(2);
    expect(sent.recovery_note).toBe("moved evening session");

    // Nested admin shapes from the backend response are not promoted to the public result.
    const text = JSON.stringify(json);
    expect(text).not.toContain("recovery_preview_before");
    expect(text).not.toContain("execution_summary_after");
  });

  test("backend 412 stale propagates safe envelope", async () => {
    jar._store.set("sola_access", { value: "ACC_R", options: {} });
    stubFetch([
      {
        status: 412,
        body: {
          detail: "stale",
          error_code: "expected_schedule_revision_mismatch",
          request_id: "req-r-stale",
        },
        headers: { "x-request-id": "req-r-stale" },
      },
    ]);
    const r = await POST(
      jsonReq({ mode: "rebalance", expected_version: 5, expected_schedule_revision: 1 }),
      { params: Promise.resolve({ planId: "199" }) },
    );
    expect(r.status).toBe(412);
    const json = await r.json();
    expect(json.error_code).toBe("expected_schedule_revision_mismatch");
  });
});
