import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { PUT } from "./route";

const prefResponse = {
  id: 1,
  plan_id: 9,
  plan_version: 8,
  preferred_time_window: "evening",
  pace_mode: "standard",
  preferred_study_days: ["monday", "wednesday"],
  max_daily_minutes: 60,
  session_cap_minutes: 45,
  temporary_note: null,
  deadline_date: null,
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:10:00Z",
};

function makeJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/plans/[planId]/preferences", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const fetchSpy = stubFetch([]);
    const response = await PUT(
      makeJsonRequest("http://app.test/api/plans/9/preferences", { expected_version: 7 }),
      { params: Promise.resolve({ planId: "9" }) },
    );
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("missing expected_version in body → 422", async () => {
    jar._store.set("sola_access", { value: "ACC_P", options: {} });
    const fetchSpy = stubFetch([]);
    const response = await PUT(
      makeJsonRequest("http://app.test/api/plans/9/preferences", { preferred_time_window: "evening" }),
      { params: Promise.resolve({ planId: "9" }) },
    );
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("forwards expected_version + preferences to backend; returns PublicSchedulingPreference", async () => {
    jar._store.set("sola_access", { value: "ACC_P", options: {} });
    const fetchSpy = stubFetch([{ status: 200, body: prefResponse }]);
    const response = await PUT(
      makeJsonRequest("http://app.test/api/plans/9/preferences", {
        expected_version: 7,
        preferred_time_window: "evening",
        pace_mode: "standard",
        preferred_study_days: ["monday", "wednesday"],
        max_daily_minutes: 60,
        session_cap_minutes: 45,
      }),
      { params: Promise.resolve({ planId: "9" }) },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.planId).toBe(9);
    expect(json.preferredTimeWindowLabel).toBe("Evening");
    expect(json.paceModeLabel).toBe("Standard");
    expect(json.preferredStudyDayLabels).toEqual(["Monday", "Wednesday"]);
    expect(JSON.stringify(json)).not.toContain("plan_id");

    const callInit = fetchSpy.mock.calls[0]![1] as unknown as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(callInit.method).toBe("PUT");
    expect(callInit.headers.authorization).toBe("Bearer ACC_P");
    const sent = JSON.parse(callInit.body);
    expect(sent.expected_version).toBe(7);
    expect(sent.preferred_time_window).toBe("evening");
  });

  test("backend stale-version 409 propagates without leaking access token", async () => {
    jar._store.set("sola_access", { value: "ACC_P", options: {} });
    stubFetch([
      {
        status: 409,
        body: { detail: "Plan version mismatch", error_code: "expected_version_mismatch" },
      },
    ]);
    const response = await PUT(
      makeJsonRequest("http://app.test/api/plans/9/preferences", {
        expected_version: 3,
        preferred_time_window: "morning",
      }),
      { params: Promise.resolve({ planId: "9" }) },
    );
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error_code).toBe("expected_version_mismatch");
    expect(JSON.stringify(json)).not.toContain("ACC_P");
  });
});
