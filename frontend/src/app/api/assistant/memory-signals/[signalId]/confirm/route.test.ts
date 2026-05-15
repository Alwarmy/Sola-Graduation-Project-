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

const signal = {
  id: 91,
  user_id: 270,
  conversation_id: 11,
  source_message_id: 41,
  signal_type: "schedule_preference",
  signal_key: "preferred_time_window",
  signal_summary: "Prefers evenings.",
  signal_value: { internal: "DO_NOT_LEAK_value" },
  signal_metadata: { internal: "DO_NOT_LEAK_meta" },
  scope: "durable_preference",
  confidence_score: 0.88,
  status: "confirmed",
  effective_from: "2026-05-13T10:00:05Z",
  expires_at: null,
  created_at: "2026-05-13T10:00:05Z",
  updated_at: "2026-05-13T10:00:10Z",
};

describe("POST /api/assistant/memory-signals/[signalId]/confirm (CP9)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/memory-signals/91/confirm", { method: "POST" }),
      { params: Promise.resolve({ signalId: "91" }) },
    );
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("non-numeric signalId → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/memory-signals/abc/confirm", { method: "POST" }),
      { params: Promise.resolve({ signalId: "abc" }) },
    );
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards POST to backend with bearer and empty body; returns PublicAssistantMemorySignal (no value/metadata leak)", async () => {
    jar._store.set("sola_access", { value: "ACC_MEM", options: {} });
    const spy = stubFetch([{ status: 200, body: signal, headers: { "x-request-id": "req-mem-1" } }]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/memory-signals/91/confirm", { method: "POST" }),
      { params: Promise.resolve({ signalId: "91" }) },
    );
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.id).toBe(91);
    expect(json.statusLabel).toBe("Confirmed");
    expect(json.scopeLabel).toBe("Long-term preference");

    const init = spy.mock.calls[0]![1] as unknown as { method: string; headers: Record<string, string>; body?: unknown };
    expect(String(spy.mock.calls[0]![0])).toContain("/assistant/memory-signals/91/confirm");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer ACC_MEM");
    // Backend confirm takes no body.
    expect(init.body).toBeUndefined();

    const text = JSON.stringify(json);
    expect(text).not.toContain("signal_value");
    expect(text).not.toContain("signal_metadata");
    expect(text).not.toContain("DO_NOT_LEAK");
    expect(text).not.toContain("user_id");
  });

  test("backend 422 (e.g. signal already dismissed) propagates safe envelope", async () => {
    jar._store.set("sola_access", { value: "ACC_MEM", options: {} });
    stubFetch([
      {
        status: 422,
        body: {
          detail: "Memory signal cannot be confirmed.",
          error_code: "validation_error",
          request_id: "req-mem-422",
        },
      },
    ]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/memory-signals/91/confirm", { method: "POST" }),
      { params: Promise.resolve({ signalId: "91" }) },
    );
    expect(r.status).toBe(422);
    const json = await r.json();
    expect(json.error_code).toBe("validation_error");
  });
});
