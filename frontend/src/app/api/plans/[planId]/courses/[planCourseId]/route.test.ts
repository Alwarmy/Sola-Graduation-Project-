import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { DELETE } from "./route";

const planResponse = {
  id: 9,
  user_id: 266,
  title: "Master Python",
  goal: "Land a job",
  status: "active",
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

function makeRequest(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): NextRequest {
  return new NextRequest(url, init);
}

describe("DELETE /api/plans/[planId]/courses/[planCourseId]", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const fetchSpy = stubFetch([]);
    const response = await DELETE(
      makeRequest("http://app.test/api/plans/9/courses/55", {
        method: "DELETE",
        headers: { "x-expected-version": "8" },
      }),
      { params: Promise.resolve({ planId: "9", planCourseId: "55" }) },
    );
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("missing X-Expected-Version → 422", async () => {
    jar._store.set("sola_access", { value: "ACC_X", options: {} });
    const fetchSpy = stubFetch([]);
    const response = await DELETE(
      makeRequest("http://app.test/api/plans/9/courses/55", { method: "DELETE" }),
      { params: Promise.resolve({ planId: "9", planCourseId: "55" }) },
    );
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("forwards X-Expected-Version header verbatim to backend", async () => {
    jar._store.set("sola_access", { value: "ACC_X", options: {} });
    const fetchSpy = stubFetch([{ status: 200, body: planResponse }]);
    const response = await DELETE(
      makeRequest("http://app.test/api/plans/9/courses/55", {
        method: "DELETE",
        headers: { "x-expected-version": "8" },
      }),
      { params: Promise.resolve({ planId: "9", planCourseId: "55" }) },
    );
    expect(response.status).toBe(200);
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as {
      method: string;
      headers: Record<string, string>;
    };
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/plans/9/courses/55");
    expect(callInit.method).toBe("DELETE");
    expect(callInit.headers.authorization).toBe("Bearer ACC_X");
    expect(callInit.headers["X-Expected-Version"]).toBe("8");

    const json = await response.json();
    expect(JSON.stringify(json)).not.toContain("ACC_X");
    expect(JSON.stringify(json)).not.toContain("user_id");
  });

  test("backend 409 stale propagates", async () => {
    jar._store.set("sola_access", { value: "ACC_X", options: {} });
    stubFetch([
      { status: 409, body: { detail: "stale", error_code: "expected_version_mismatch" } },
    ]);
    const response = await DELETE(
      makeRequest("http://app.test/api/plans/9/courses/55", {
        method: "DELETE",
        headers: { "x-expected-version": "1" },
      }),
      { params: Promise.resolve({ planId: "9", planCourseId: "55" }) },
    );
    expect(response.status).toBe(409);
  });
});
