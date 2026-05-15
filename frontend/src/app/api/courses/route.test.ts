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
  id: 7,
  source: "youtube",
  external_id: "abc",
  content_type: "playlist",
  content_format_label: "Playlist course",
  title: "Python Tutorial",
  description: null,
  short_description: null,
  provider: "youtube",
  provider_display_name: "YouTube",
  channel_title: "Telusko",
  instructor_name: "Telusko",
  instructor_display_name: "Telusko",
  language: "en",
  difficulty_label: "Advanced",
  duration_label: "13h 45m estimated",
  pricing_label: "Free",
  topic_tag_labels: ["Python"],
  progression_label: "Specialization",
  quality_tier: "high",
  card_summary: "Playlist course • Advanced • 13h 45m estimated • Free • By Telusko",
  badges: [{ key: "pricing", label: "Free", tone: "success" }],
  // Raw / internal / token-shaped fields that MUST be stripped server-side.
  provider_metadata: { youtube_channel_title: "Telusko", source: "youtube" },
  quality_signals: { ai_validated: true, heuristic_score_normalized: 100 },
  personalization: { fit_score: 99, profile_alignment: { secret: "leak_should_not_reach" } },
  discovery: { ranking_reasons: ["query_in_title"] },
  access_token: "DO_NOT_LEAK_access_token",
  refresh_token: "DO_NOT_LEAK_refresh_token",
};

describe("GET /api/courses (optional-auth catalog)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous: calls backend without Authorization, succeeds, returns PublicCourseCard[]", async () => {
    const fetchSpy = stubFetch([
      { status: 200, body: [sampleCard], headers: { "x-request-id": "req-c-1" } },
    ]);
    const response = await GET(makeRequest("http://app.test/api/courses?limit=2"));
    expect(response.status).toBe(200);
    const json = await response.json();

    // Single backend call to /courses with NO Authorization header.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as { headers: Record<string, string> };
    expect(callInit.headers.authorization).toBeUndefined();

    // Response is PublicCourseCard[] (camelCase) — no raw or token fields.
    expect(Array.isArray(json)).toBe(true);
    const body = JSON.stringify(json);
    expect(body).not.toContain("access_token");
    expect(body).not.toContain("refresh_token");
    expect(body).not.toContain("provider_metadata");
    expect(body).not.toContain("quality_signals");
    expect(body).not.toContain("personalization");
    expect(body).not.toContain("discovery");
    expect(body).not.toContain("DO_NOT_LEAK");
    expect(json[0].providerDisplayName).toBe("YouTube");
    expect(json[0].cardSummary).toContain("Playlist course");
  });

  test("authenticated: forwards bearer when access cookie exists", async () => {
    jar._store.set("sola_access", { value: "ACC_X_test", options: {} });
    const fetchSpy = stubFetch([{ status: 200, body: [sampleCard] }]);
    const response = await GET(makeRequest("http://app.test/api/courses"));
    expect(response.status).toBe(200);
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as { headers: Record<string, string> };
    expect(callInit.headers.authorization).toBe("Bearer ACC_X_test");
  });

  test("query params are forwarded; unknown params are dropped", async () => {
    const fetchSpy = stubFetch([{ status: 200, body: [] }]);
    const response = await GET(
      makeRequest("http://app.test/api/courses?q=python&limit=12&offset=5&malicious=1"),
    );
    expect(response.status).toBe(200);
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain("/courses?");
    expect(url).toContain("q=python");
    expect(url).toContain("limit=12");
    expect(url).toContain("offset=5");
    expect(url).not.toContain("malicious");
  });

  test("backend error maps through safe envelope (no leaks)", async () => {
    stubFetch([
      {
        status: 502,
        body: { detail: "Upstream catalog unavailable", error_code: "source_unavailable" },
      },
    ]);
    const response = await GET(makeRequest("http://app.test/api/courses"));
    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error_code).toBe("source_unavailable");
    expect(JSON.stringify(json)).not.toContain("access_token");
  });
});
