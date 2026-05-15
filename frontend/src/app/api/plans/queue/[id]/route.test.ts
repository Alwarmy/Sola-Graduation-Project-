import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { POST, DELETE } from "./route";

const courseCard = {
  id: 42,
  source: "youtube",
  external_id: "ext42",
  content_type: "video",
  content_format_label: "Video course",
  title: "Sample Course",
  provider: "youtube",
  provider_display_name: "YouTube",
  card_summary: "Video course",
  badges: [],
};

const queueItem = {
  id: 11,
  user_id: 266,
  course_id: 42,
  status: "queued",
  note: null,
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:00:00Z",
  course: courseCard,
  // Surface that must be stripped:
  access_token: "DO_NOT_LEAK_token",
};

function makeRequest(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): NextRequest {
  return new NextRequest(url, init);
}

describe("POST /api/plans/queue/[id]", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const fetchSpy = stubFetch([]);
    const response = await POST(makeRequest("http://app.test/api/plans/queue/42", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ id: "42" }),
    });
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("authenticated: forwards bearer and POSTs /plans/queue/{id}, strips raw fields", async () => {
    jar._store.set("sola_access", { value: "ACC_Q", options: {} });
    const fetchSpy = stubFetch([{ status: 201, body: queueItem, headers: { "x-request-id": "req-q-1" } }]);
    const response = await POST(
      makeRequest("http://app.test/api/plans/queue/42", {
        method: "POST",
        body: JSON.stringify({ note: "Looks good" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "42" }) },
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe(11);
    expect(json.courseId).toBe(42);
    expect(json.statusLabel).toBe("Queued");
    // No raw leaks.
    const body = JSON.stringify(json);
    expect(body).not.toContain("access_token");
    expect(body).not.toContain("DO_NOT_LEAK");
    expect(body).not.toContain("user_id");
    expect(body).not.toContain("course_id");

    const callUrl = String(fetchSpy.mock.calls[0]![0]);
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(callUrl).toContain("/plans/queue/42");
    expect(callInit.method).toBe("POST");
    expect(callInit.headers.authorization).toBe("Bearer ACC_Q");
    expect(JSON.parse(callInit.body)).toEqual({ note: "Looks good" });
  });

  test("blank id → 422, no backend call", async () => {
    jar._store.set("sola_access", { value: "ACC_Q", options: {} });
    const fetchSpy = stubFetch([]);
    const response = await POST(
      makeRequest("http://app.test/api/plans/queue/", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "   " }) },
    );
    expect(response.status).toBe(422);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("backend 409 conflict propagates as conflict envelope (no token)", async () => {
    jar._store.set("sola_access", { value: "ACC_Q", options: {} });
    stubFetch([
      {
        status: 409,
        body: { detail: "Course already in queue", error_code: "queue_item_already_exists" },
      },
    ]);
    const response = await POST(
      makeRequest("http://app.test/api/plans/queue/42", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ id: "42" }) },
    );
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(JSON.stringify(json)).not.toContain("access_token");
    expect(JSON.stringify(json)).not.toContain("ACC_Q");
  });
});

describe("DELETE /api/plans/queue/[id]", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const fetchSpy = stubFetch([]);
    const response = await DELETE(makeRequest("http://app.test/api/plans/queue/11", { method: "DELETE" }), {
      params: Promise.resolve({ id: "11" }),
    });
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("authenticated: DELETE forwards to /plans/queue/{id}", async () => {
    jar._store.set("sola_access", { value: "ACC_Q", options: {} });
    const fetchSpy = stubFetch([{ status: 200, body: { detail: "ok" } }]);
    const response = await DELETE(makeRequest("http://app.test/api/plans/queue/11", { method: "DELETE" }), {
      params: Promise.resolve({ id: "11" }),
    });
    expect(response.status).toBe(200);
    const callUrl = String(fetchSpy.mock.calls[0]![0]);
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as {
      method: string;
      headers: Record<string, string>;
    };
    expect(callUrl).toContain("/plans/queue/11");
    expect(callInit.method).toBe("DELETE");
    expect(callInit.headers.authorization).toBe("Bearer ACC_Q");
  });
});
