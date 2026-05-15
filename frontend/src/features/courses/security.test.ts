import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

const TOKEN_KEYS = ["access_token", "refresh_token", "session_id"] as const;
const TOKEN_VALUES = ["JWT_SECRET_LEAK_TEST", "REFRESH_SECRET_LEAK_TEST"];
const INGEST_FIELDS = ["ingest", "ingestion_id", "total_raw_items", "total_promoted_courses"];

/**
 * Cross-cutting CP6 security guard: the `/api/courses/search` orchestrator
 * must never echo ingest fields or token-like values to the browser body,
 * even if the upstream ingest backend sneaks them into its response.
 */
describe("CP6 courses security guard", () => {
  beforeEach(() => {
    jar._store.clear();
    jar._store.set("sola_access", { value: "ACC_X_test", options: {} });
  });
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("orchestrator strips ingest body even if backend ingest leaks token-looking fields", async () => {
    const { POST } = await import("@/app/api/courses/search/route");
    stubFetch([
      {
        status: 201,
        body: {
          ingestion_id: 42,
          total_raw_items: 99,
          total_promoted_courses: 7,
          courses: [{ id: 1, source: "youtube", external_id: "x", content_type: "video", title: "X", provider: "y" }],
          access_token: TOKEN_VALUES[0],
          refresh_token: TOKEN_VALUES[1],
        },
      },
      {
        status: 200,
        body: {
          items: [
            {
              id: 1,
              source: "youtube",
              external_id: "x",
              content_type: "video",
              title: "Safe Course",
              provider: "youtube",
              provider_display_name: "YouTube",
              card_summary: "Video course",
              badges: [],
            },
          ],
          metadata: { total: 1, returned_count: 1, limit: 12, offset: 0, has_more: false },
          facets: {},
          applied_filters: { q: "python", limit: 12, offset: 0 },
        },
      },
    ]);
    const response = await POST(
      new Request("http://app.test/api/courses/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: "python", limit: 12, offset: 0 }),
      }) as never,
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    const body = JSON.stringify(json);
    for (const key of TOKEN_KEYS) {
      expect(body, `token-key leak: ${key}`).not.toContain(key);
    }
    for (const value of TOKEN_VALUES) {
      expect(body, `token-value leak: ${value}`).not.toContain(value);
    }
    for (const field of INGEST_FIELDS) {
      expect(body.toLowerCase(), `ingest-field leak: ${field}`).not.toContain(field);
    }
  });
});
