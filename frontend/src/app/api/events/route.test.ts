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

const rawKnown = {
  id: 100,
  user_id: 275,
  event_type: "course_opened",
  event_payload: {
    course_id: 99,
    referrer: "internal_pipeline",
    DO_NOT_LEAK: "raw_payload_internal",
  },
  created_at: "2026-05-14T09:00:00Z",
};

const rawUnknown = { ...rawKnown, id: 101, event_type: "future_unknown_event" };

const LEAK_SENTINELS = [
  "access_token",
  "refresh_token",
  "session_id",
  "event_payload",
  "user_id",
  "DO_NOT_LEAK",
  "referrer",
  "internal_pipeline",
];

function assertNoLeak(text: string) {
  for (const s of LEAK_SENTINELS) expect(text).not.toContain(s);
}

describe("GET /api/events (CP11)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await GET(new NextRequest("http://app.test/api/events"));
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicLearnerEvent[] with event_payload + user_id stripped; unknown type → 'Learning activity'", async () => {
    jar._store.set("sola_access", { value: "ACC_E", options: {} });
    stubFetch([
      {
        status: 200,
        body: [rawKnown, rawUnknown],
        headers: { "x-request-id": "req-e-1" },
      },
    ]);
    const r = await GET(new NextRequest("http://app.test/api/events"));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json).toHaveLength(2);
    expect(json[0].eventTypeLabel).toBe("Opened a course");
    expect(json[0].isKnownEventType).toBe(true);
    expect(json[1].eventTypeLabel).toBe("Learning activity");
    expect(json[1].isKnownEventType).toBe(false);
    assertNoLeak(JSON.stringify(json));
  });

  test("forwards safe query params; drops invalid limit/offset", async () => {
    jar._store.set("sola_access", { value: "ACC_E", options: {} });
    const spy = stubFetch([{ status: 200, body: [] }]);
    await GET(
      new NextRequest(
        "http://app.test/api/events?event_type=course_opened&limit=50&offset=10",
      ),
    );
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain("event_type=course_opened");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=10");
  });

  test("clamps limit to 100; drops non-numeric / negative", async () => {
    jar._store.set("sola_access", { value: "ACC_E", options: {} });
    const spy = stubFetch([
      { status: 200, body: [] },
      { status: 200, body: [] },
      { status: 200, body: [] },
    ]);
    await GET(new NextRequest("http://app.test/api/events?limit=9999"));
    expect(String(spy.mock.calls[0]![0])).toContain("limit=100");
    await GET(new NextRequest("http://app.test/api/events?limit=abc&offset=xyz"));
    const url2 = String(spy.mock.calls[1]![0]);
    expect(url2).not.toContain("limit=abc");
    expect(url2).not.toContain("offset=xyz");
    await GET(new NextRequest("http://app.test/api/events?limit=-5"));
    expect(String(spy.mock.calls[2]![0])).not.toContain("limit=-5");
  });

  test("backend 500 propagates safe envelope with request-id", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([
      {
        status: 500,
        body: {
          detail: "Internal server error.",
          error_code: "internal_server_error",
          request_id: "req-e-500",
        },
      },
    ]);
    const r = await GET(new NextRequest("http://app.test/api/events"));
    expect(r.status).toBe(500);
    expect(r.headers.get("x-request-id")).toBe("req-e-500");
  });
});
