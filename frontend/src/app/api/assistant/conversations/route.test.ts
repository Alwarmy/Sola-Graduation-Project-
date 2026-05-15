import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { GET, POST } from "./route";

const conversation = {
  id: 11,
  user_id: 270,
  title: "First conversation",
  status: "active",
  conversation_metadata: { internal: "DO_NOT_LEAK_meta" },
  last_user_message_at: null,
  last_assistant_message_at: null,
  created_at: "2026-05-13T10:00:00Z",
  updated_at: "2026-05-13T10:00:00Z",
};

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("http://app.test/api/assistant/conversations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/assistant/conversations (CP9)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await POST(jsonReq({ title: "Help" }));
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("invalid title (e.g. empty string) → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await POST(jsonReq({ title: "" }));
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("title is optional — accepts empty body and forwards bare object to backend", async () => {
    jar._store.set("sola_access", { value: "ACC_C", options: {} });
    const spy = stubFetch([{ status: 201, body: conversation }]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/conversations", {
        method: "POST",
        body: "",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(r.status).toBe(201);
    const init = spy.mock.calls[0]![1] as unknown as { body: string };
    expect(JSON.parse(init.body)).toEqual({});
  });

  test("valid title forwards body verbatim and returns PublicAssistantConversation (no internal leak)", async () => {
    jar._store.set("sola_access", { value: "ACC_C", options: {} });
    const spy = stubFetch([
      { status: 201, body: conversation, headers: { "x-request-id": "req-c-1" } },
    ]);
    const r = await POST(jsonReq({ title: "First conversation" }));
    expect(r.status).toBe(201);
    const json = await r.json();
    expect(json.id).toBe(11);
    expect(json.statusLabel).toBe("Active");
    expect(json.title).toBe("First conversation");

    const init = spy.mock.calls[0]![1] as unknown as { headers: Record<string, string>; body: string };
    expect(String(spy.mock.calls[0]![0])).toContain("/assistant/conversations");
    expect(init.headers.authorization).toBe("Bearer ACC_C");
    expect(JSON.parse(init.body)).toEqual({ title: "First conversation" });

    const text = JSON.stringify(json);
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("conversation_metadata");
    expect(text).not.toContain("user_id");
    expect(text).not.toContain("DO_NOT_LEAK");
  });

  test("backend 422 propagates safe envelope", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([
      {
        status: 422,
        body: {
          detail: "Request validation failed.",
          error_code: "request_validation_error",
          request_id: "req-c-422",
        },
      },
    ]);
    const r = await POST(jsonReq({ title: "T" }));
    expect(r.status).toBe(422);
    const json = await r.json();
    expect(json.error_code).toBe("request_validation_error");
  });
});

describe("GET /api/assistant/conversations (CP9 closure-pass dedicated read)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await GET();
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicAssistantConversation[] with NO conversation_metadata or user_id leak", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([
      {
        status: 200,
        body: [conversation, { ...conversation, id: 12, title: "Second" }],
        headers: { "x-request-id": "req-list" },
      },
    ]);
    const r = await GET();
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json).toHaveLength(2);
    expect(json[0].id).toBe(11);
    expect(json[0].statusLabel).toBe("Active");
    // Verify the backend got bearer.
    const init = spy.mock.calls[0]![1] as unknown as { headers: Record<string, string> };
    expect(init.headers.authorization).toBe("Bearer ACC");
    // The dedicated handler strips internals server-side.
    const text = JSON.stringify(json);
    expect(text).not.toContain("conversation_metadata");
    expect(text).not.toContain("user_id");
    expect(text).not.toContain("DO_NOT_LEAK");
  });
});
