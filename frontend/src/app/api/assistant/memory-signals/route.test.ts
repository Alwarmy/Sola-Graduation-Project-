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
  status: "proposed",
  effective_from: null,
  expires_at: null,
  created_at: "2026-05-13T10:00:00Z",
  updated_at: "2026-05-13T10:00:00Z",
};

describe("GET /api/assistant/memory-signals (CP9 closure-pass dedicated read)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await GET(new NextRequest("http://app.test/api/assistant/memory-signals"));
    expect(r.status).toBe(401);
  });

  test("returns PublicAssistantMemorySignal[] with NO signal_value / signal_metadata leak", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: [signal, { ...signal, id: 92, status: "active" }] }]);
    const r = await GET(new NextRequest("http://app.test/api/assistant/memory-signals"));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json).toHaveLength(2);
    expect(json[0].statusLabel).toBe("Proposed");
    expect(json[1].statusLabel).toBe("Active");
    const text = JSON.stringify(json);
    expect(text).not.toContain("signal_value");
    expect(text).not.toContain("signal_metadata");
    expect(text).not.toContain("DO_NOT_LEAK");
    expect(text).not.toContain("user_id");
  });

  test("forwards filter query params verbatim", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([{ status: 200, body: [] }]);
    await GET(
      new NextRequest(
        "http://app.test/api/assistant/memory-signals?status_filter=proposed&effective_only=true&conversation_id=11",
      ),
    );
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain("/assistant/memory-signals?");
    expect(url).toContain("status_filter=proposed");
    expect(url).toContain("effective_only=true");
    expect(url).toContain("conversation_id=11");
  });

  test("rejects non-numeric conversation_id by silently dropping it (defensive)", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([{ status: 200, body: [] }]);
    await GET(
      new NextRequest("http://app.test/api/assistant/memory-signals?conversation_id=abc"),
    );
    const url = String(spy.mock.calls[0]![0]);
    expect(url).not.toContain("conversation_id=abc");
  });
});
