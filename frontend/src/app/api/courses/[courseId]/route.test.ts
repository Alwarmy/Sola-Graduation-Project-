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

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

const sampleCard = {
  id: 42,
  source: "youtube",
  external_id: "ext42",
  content_type: "video",
  content_format_label: "Video course",
  title: "Sample Course",
  provider: "youtube",
  provider_display_name: "YouTube",
  card_summary: "Video course • Beginner • Free",
  badges: [],
  // Stripped server-side:
  provider_metadata: { source: "youtube" },
  quality_signals: { ai_validated: true },
  personalization: { fit_score: 88 },
  discovery: { ranking_reasons: [] },
  access_token: "DO_NOT_LEAK_access_token",
};

describe("GET /api/courses/[courseId] (optional-auth detail)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous: calls backend without Authorization, returns PublicCourseCard", async () => {
    const fetchSpy = stubFetch([
      { status: 200, body: sampleCard, headers: { "x-request-id": "req-d-1" } },
    ]);
    const response = await GET(makeRequest("http://app.test/api/courses/42"), {
      params: Promise.resolve({ courseId: "42" }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as { headers: Record<string, string> };
    expect(callInit.headers.authorization).toBeUndefined();
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/courses/42");

    expect(json.id).toBe(42);
    expect(json.providerDisplayName).toBe("YouTube");
    const body = JSON.stringify(json);
    expect(body).not.toContain("access_token");
    expect(body).not.toContain("provider_metadata");
    expect(body).not.toContain("quality_signals");
    expect(body).not.toContain("personalization");
    expect(body).not.toContain("discovery");
    expect(body).not.toContain("DO_NOT_LEAK");
  });

  test("authenticated: forwards bearer when access cookie exists", async () => {
    jar._store.set("sola_access", { value: "ACC_X_test", options: {} });
    const fetchSpy = stubFetch([{ status: 200, body: sampleCard }]);
    await GET(makeRequest("http://app.test/api/courses/42"), {
      params: Promise.resolve({ courseId: "42" }),
    });
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as { headers: Record<string, string> };
    expect(callInit.headers.authorization).toBe("Bearer ACC_X_test");
  });

  test("non-numeric courseId returns 404 (not 422) without calling backend (Pre-CP8 D-5)", async () => {
    const fetchSpy = stubFetch([]);
    const response = await GET(makeRequest("http://app.test/api/courses/abc"), {
      params: Promise.resolve({ courseId: "abc" }),
    });
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error_code).toBe("not_found");
    expect(json.detail).toBe("Course not found.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("zero / negative / decimal courseId is rejected as 404 without calling backend (Pre-CP8 D-5)", async () => {
    const fetchSpy = stubFetch([]);
    for (const bad of ["0", "-1", "1e2", "1.5", "1abc"]) {
      const response = await GET(makeRequest(`http://app.test/api/courses/${bad}`), {
        params: Promise.resolve({ courseId: bad }),
      });
      expect(response.status).toBe(404);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("empty/blank courseId returns 422 without calling backend", async () => {
    const fetchSpy = stubFetch([]);
    const response = await GET(makeRequest("http://app.test/api/courses/"), {
      params: Promise.resolve({ courseId: "   " }),
    });
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("backend 404 maps to safe envelope (no leak)", async () => {
    stubFetch([
      {
        status: 404,
        body: { detail: "Course not found", error_code: "not_found", request_id: "req-d-404" },
      },
    ]);
    const response = await GET(makeRequest("http://app.test/api/courses/99999"), {
      params: Promise.resolve({ courseId: "99999" }),
    });
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error_code).toBe("not_found");
    expect(JSON.stringify(json)).not.toContain("access_token");
  });
});
