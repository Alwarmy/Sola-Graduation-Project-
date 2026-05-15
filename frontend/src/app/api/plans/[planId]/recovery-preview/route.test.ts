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

const preview = {
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
  available_recovery_modes: ["rebalance", "recover_overdue_first", "lighten_load"],
};

describe("GET /api/plans/[planId]/recovery-preview (CP8)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await GET(new NextRequest("http://app.test/api/plans/199/recovery-preview"), {
      params: Promise.resolve({ planId: "199" }),
    });
    expect(r.status).toBe(401);
  });

  test("returns PublicRecoveryPreview with safe labels", async () => {
    jar._store.set("sola_access", { value: "ACC_RP", options: {} });
    stubFetch([{ status: 200, body: preview }]);
    const r = await GET(new NextRequest("http://app.test/api/plans/199/recovery-preview"), {
      params: Promise.resolve({ planId: "199" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.driftLevelLabel).toBe("Behind schedule");
    expect(json.recoveryPressureLabel).toBe("57%");
    expect(json.recommendedRecoveryModeLabel).toBe("Rebalance the schedule");
    // Backend keys not leaked.
    const text = JSON.stringify(json);
    expect(text).not.toContain("recovery_pressure_ratio");
    expect(text).not.toContain("available_recovery_modes");
  });
});
