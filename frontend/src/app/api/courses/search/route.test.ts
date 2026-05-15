import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { POST } from "./route";

function makeRequest(payload: unknown): Request {
  return new Request("http://app.test/api/courses/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const minimalSearchResponse = {
  items: [
    {
      id: 2,
      source: "youtube",
      external_id: "abc",
      content_type: "playlist",
      content_format_label: "Playlist course",
      title: "Python Tutorial",
      provider: "youtube",
      provider_display_name: "YouTube",
      difficulty_label: "Advanced",
      duration_label: "13h 45m estimated",
      pricing_label: "Free",
      topic_tag_labels: ["Python"],
      card_summary: "Playlist course • Advanced • 13h 45m estimated • Free",
      badges: [{ key: "pricing", label: "Free", tone: "success" }],
    },
  ],
  metadata: {
    total: 1,
    returned_count: 1,
    limit: 12,
    offset: 0,
    has_more: false,
    sort_by: "relevance",
    ranking_mode: "search_relevance",
    query_text: "python",
  },
  facets: {},
  applied_filters: { q: "python", limit: 12, offset: 0 },
};

const ingestSampleResponseWithSecrets = {
  ingestion_id: 999,
  total_raw_items: 50,
  total_promoted_courses: 7,
  courses: [
    {
      id: 999,
      source: "youtube",
      external_id: "SECRET_external",
      content_type: "playlist",
      title: "SHOULD NOT REACH BROWSER",
      provider: "youtube",
    },
  ],
  // Stray secrets that should never escape the orchestrator.
  access_token: "DO_NOT_LEAK_access_token",
  refresh_token: "DO_NOT_LEAK_refresh_token",
};

describe("POST /api/courses/search — anonymous", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous: skips ingest, runs only /courses/search, returns curated PublicCourseSearch", async () => {
    const fetchSpy = stubFetch([
      { status: 200, body: minimalSearchResponse, headers: { "x-request-id": "req-search-1" } },
    ]);
    const response = await POST(makeRequest({ q: "python", limit: 12, offset: 0 }) as never);
    expect(response.status).toBe(200);
    const json = await response.json();

    // Only one backend call — /courses/search (no ingest).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/courses/search");
    expect(String(fetchSpy.mock.calls[0]![0])).not.toContain("/courses/ingest");

    expect(json.sourceStatus).toBe("anonymous");
    expect(json.search.queryText).toBe("python");
    expect(json.search.items).toHaveLength(1);
    expect(json.search.items[0].title).toBe("Python Tutorial");
  });
});

describe("POST /api/courses/search — authenticated", () => {
  beforeEach(() => {
    jar._store.clear();
    jar._store.set("sola_access", { value: "ACC_X_redacted", options: {} });
  });
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("authenticated: calls ingest THEN search; ingest body never leaks", async () => {
    const fetchSpy = stubFetch([
      { status: 201, body: ingestSampleResponseWithSecrets },
      { status: 200, body: minimalSearchResponse, headers: { "x-request-id": "req-search-2" } },
    ]);
    const response = await POST(makeRequest({ q: "python", limit: 12, offset: 0 }) as never);
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("/courses/ingest");
    expect(String(fetchSpy.mock.calls[1]![0])).toContain("/courses/search");

    expect(json.sourceStatus).toBe("fresh");

    // Critical: ingest fields and secrets MUST NOT appear in the browser body.
    const body = JSON.stringify(json);
    expect(body).not.toContain("ingest");
    expect(body).not.toContain("ingestion_id");
    expect(body).not.toContain("total_raw_items");
    expect(body).not.toContain("total_promoted_courses");
    expect(body).not.toContain("DO_NOT_LEAK_access_token");
    expect(body).not.toContain("DO_NOT_LEAK_refresh_token");
    expect(body).not.toContain("SHOULD NOT REACH BROWSER");
    expect(body).not.toContain("access_token");
    expect(body).not.toContain("refresh_token");
  });

  test("authenticated + provider 502: ingest is swallowed, search still runs, sourceStatus=stale", async () => {
    stubFetch([
      { status: 502, body: { detail: "Upstream provider unavailable", error_code: "source_unavailable" } },
      { status: 200, body: minimalSearchResponse },
    ]);
    const response = await POST(makeRequest({ q: "python" }) as never);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.sourceStatus).toBe("stale");
    expect(json.search.items).toHaveLength(1);
    // No raw "Upstream provider unavailable" or admin wording leaks.
    expect(JSON.stringify(json)).not.toContain("Upstream provider unavailable");
  });

  test("authenticated + search 500: surfaces a safe envelope, no token leak", async () => {
    stubFetch([
      { status: 201, body: { ingestion_id: 1, total_raw_items: 0, total_promoted_courses: 0, courses: [] } },
      { status: 500, body: { detail: "Backend boom", error_code: "internal_error", request_id: "req-err" } },
    ]);
    const response = await POST(makeRequest({ q: "python" }) as never);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error_code).toBe("internal_error");
    expect(JSON.stringify(json)).not.toContain("access_token");
    expect(JSON.stringify(json)).not.toContain("ingestion_id");
  });

  test("invalid payload: 422 with safe envelope, no fetch issued", async () => {
    const fetchSpy = stubFetch([]);
    const response = await POST(makeRequest({ limit: "not-a-number" }) as never);
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
