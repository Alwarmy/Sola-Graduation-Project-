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

const planResponse = {
  id: 9,
  user_id: 266,
  title: "Master Python",
  goal: "Land a Python job",
  status: "active",
  version: 8,
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

describe("POST /api/plans/[planId]/courses/queue-items/[queueItemId]", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const fetchSpy = stubFetch([]);
    const response = await POST(
      makeRequest("http://app.test/api/plans/9/courses/queue-items/11", {
        method: "POST",
        headers: { "x-expected-version": "7" },
      }),
      { params: Promise.resolve({ planId: "9", queueItemId: "11" }) },
    );
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("missing X-Expected-Version → 422, no backend call", async () => {
    jar._store.set("sola_access", { value: "ACC_P", options: {} });
    const fetchSpy = stubFetch([]);
    const response = await POST(
      makeRequest("http://app.test/api/plans/9/courses/queue-items/11", { method: "POST" }),
      { params: Promise.resolve({ planId: "9", queueItemId: "11" }) },
    );
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("forwards X-Expected-Version header to backend", async () => {
    jar._store.set("sola_access", { value: "ACC_P", options: {} });
    const fetchSpy = stubFetch([{ status: 200, body: planResponse }]);
    const response = await POST(
      makeRequest("http://app.test/api/plans/9/courses/queue-items/11", {
        method: "POST",
        headers: { "x-expected-version": "7" },
      }),
      { params: Promise.resolve({ planId: "9", queueItemId: "11" }) },
    );
    expect(response.status).toBe(200);
    const callUrl = String(fetchSpy.mock.calls[0]![0]);
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as {
      method: string;
      headers: Record<string, string>;
    };
    expect(callUrl).toContain("/plans/9/courses/queue-items/11");
    expect(callInit.method).toBe("POST");
    expect(callInit.headers.authorization).toBe("Bearer ACC_P");
    // Header is set verbatim from EXPECTED_VERSION_HEADER constant ("X-Expected-Version").
    expect(callInit.headers["X-Expected-Version"]).toBe("7");

    const json = await response.json();
    expect(json.id).toBe(9);
    expect(json.version).toBe(8);
    expect(json.statusLabel).toBe("Active");
    // No raw leaks.
    expect(JSON.stringify(json)).not.toContain("user_id");
    expect(JSON.stringify(json)).not.toContain("schedule_revision");
  });

  test("expected version 0 / negative / non-numeric → 422", async () => {
    jar._store.set("sola_access", { value: "ACC_P", options: {} });
    const fetchSpy = stubFetch([]);
    for (const bad of ["0", "-1", "abc", ""]) {
      const response = await POST(
        makeRequest("http://app.test/api/plans/9/courses/queue-items/11", {
          method: "POST",
          headers: { "x-expected-version": bad },
        }),
        { params: Promise.resolve({ planId: "9", queueItemId: "11" }) },
      );
      expect(response.status).toBe(422);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("backend 409 stale-version propagates conflict envelope", async () => {
    jar._store.set("sola_access", { value: "ACC_P", options: {} });
    stubFetch([
      {
        status: 409,
        body: { detail: "Plan version mismatch", error_code: "expected_version_mismatch" },
      },
    ]);
    const response = await POST(
      makeRequest("http://app.test/api/plans/9/courses/queue-items/11", {
        method: "POST",
        headers: { "x-expected-version": "5" },
      }),
      { params: Promise.resolve({ planId: "9", queueItemId: "11" }) },
    );
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error_code).toBe("expected_version_mismatch");
    expect(JSON.stringify(json)).not.toContain("ACC_P");
    expect(JSON.stringify(json)).not.toContain("access_token");
  });
});
