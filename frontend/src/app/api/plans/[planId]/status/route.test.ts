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

const planResponse = {
  id: 9,
  user_id: 266,
  title: "Master Python",
  goal: "Land a job",
  status: "paused",
  version: 9,
  schedule_revision: 0,
  current_focus_snapshot: null,
  weekly_hours_snapshot: 10,
  schedule_timezone_snapshot: "Asia/Riyadh",
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:10:00Z",
  preference: null,
  courses: [],
};

function makeJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PUT /api/plans/[planId]/status", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const fetchSpy = stubFetch([]);
    const response = await PUT(
      makeJsonRequest("http://app.test/api/plans/9/status", { status: "paused", expected_version: 8 }),
      { params: Promise.resolve({ planId: "9" }) },
    );
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("missing status or expected_version → 422", async () => {
    jar._store.set("sola_access", { value: "ACC_S", options: {} });
    const fetchSpy = stubFetch([]);
    for (const bad of [{}, { status: "paused" }, { expected_version: 1 }, { status: "", expected_version: 1 }]) {
      const response = await PUT(makeJsonRequest("http://app.test/api/plans/9/status", bad), {
        params: Promise.resolve({ planId: "9" }),
      });
      expect(response.status).toBe(422);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("forwards status + expected_version; returns PublicLearningPlan", async () => {
    jar._store.set("sola_access", { value: "ACC_S", options: {} });
    const fetchSpy = stubFetch([{ status: 200, body: planResponse }]);
    const response = await PUT(
      makeJsonRequest("http://app.test/api/plans/9/status", { status: "paused", expected_version: 8 }),
      { params: Promise.resolve({ planId: "9" }) },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe("paused");
    expect(json.statusLabel).toBe("Paused");
    expect(json.version).toBe(9);

    const callInit = fetchSpy.mock.calls[0]![1] as unknown as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/plans/9/status");
    expect(callInit.method).toBe("PUT");
    expect(callInit.headers.authorization).toBe("Bearer ACC_S");
    const sent = JSON.parse(callInit.body);
    expect(sent.status).toBe("paused");
    expect(sent.expected_version).toBe(8);
  });
});
