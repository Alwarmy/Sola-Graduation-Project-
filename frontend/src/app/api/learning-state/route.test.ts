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
import { POST as refreshPost } from "./refresh/route";

const rawState = {
  id: 1,
  user_id: 275,
  dominant_interests: ["python"],
  emerging_interests: [],
  covered_topics: ["variables"],
  topic_familiarity: { variables: 0.8, DO_NOT_LEAK: "internal" },
  topic_families: { python: ["variables"] },
  current_focus: "python",
  preferred_content_type: "video",
  preferred_course_length: "medium",
  effective_preferred_language: "en",
  engagement_score: 42,
  source_profile_snapshot: { DO_NOT_LEAK: "snapshot_internal" },
  source_event_summary: { DO_NOT_LEAK: "event_internal" },
  profile_alignment: { DO_NOT_LEAK: "alignment_internal" },
  created_at: "2026-05-14T09:00:00Z",
  updated_at: "2026-05-14T09:00:00Z",
};

const LEAK_SENTINELS = [
  "access_token",
  "refresh_token",
  "session_id",
  "topic_familiarity",
  "topic_families",
  "source_profile_snapshot",
  "source_event_summary",
  "profile_alignment",
  "user_id",
  "DO_NOT_LEAK",
];

function assertNoLeak(text: string) {
  for (const s of LEAK_SENTINELS) expect(text).not.toContain(s);
}

describe("GET /api/learning-state (CP11)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await GET(new NextRequest("http://app.test/api/learning-state"));
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicLearningState with all 5 internal dicts + user_id stripped", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: rawState, headers: { "x-request-id": "req-ls-1" } }]);
    const r = await GET(new NextRequest("http://app.test/api/learning-state"));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.dominantInterests).toEqual(["python"]);
    expect(json.preferredContentTypeLabel).toBe("Video");
    expect(json.preferredLanguageLabel).toBe("English");
    expect(json.engagementScore).toBe(42);
    expect(r.headers.get("x-request-id")).toBe("req-ls-1");
    assertNoLeak(JSON.stringify(json));
  });

  test("backend 404 propagates safely (no token leak)", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([
      {
        status: 404,
        body: { detail: "Not found", error_code: "not_found", request_id: "req-ls-404" },
      },
    ]);
    const r = await GET(new NextRequest("http://app.test/api/learning-state"));
    expect(r.status).toBe(404);
    assertNoLeak(JSON.stringify(await r.json()));
  });
});

describe("POST /api/learning-state/refresh (CP11)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await refreshPost(
      new NextRequest("http://app.test/api/learning-state/refresh", { method: "POST" }),
    );
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards POST + bearer; returns adapted PublicLearningState (no internal dicts)", async () => {
    jar._store.set("sola_access", { value: "ACC_R", options: {} });
    const spy = stubFetch([
      {
        status: 200,
        body: { ...rawState, engagement_score: 55 },
        headers: { "x-request-id": "req-ls-refresh" },
      },
    ]);
    const r = await refreshPost(
      new NextRequest("http://app.test/api/learning-state/refresh", { method: "POST" }),
    );
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.engagementScore).toBe(55);

    const init = spy.mock.calls[0]![1] as unknown as { method: string; headers: Record<string, string> };
    expect(String(spy.mock.calls[0]![0])).toContain("/learning-state/refresh");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer ACC_R");

    assertNoLeak(JSON.stringify(json));
  });

  test("backend 500 surfaces a safe envelope with request-id", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([
      {
        status: 500,
        body: {
          detail: "Internal server error.",
          error_code: "internal_server_error",
          request_id: "req-ls-500",
        },
      },
    ]);
    const r = await refreshPost(
      new NextRequest("http://app.test/api/learning-state/refresh", { method: "POST" }),
    );
    expect(r.status).toBe(500);
    expect(r.headers.get("x-request-id")).toBe("req-ls-500");
  });
});
