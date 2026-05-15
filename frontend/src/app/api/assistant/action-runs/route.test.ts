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

const run = {
  id: 71,
  user_id: 270,
  conversation_id: 11,
  source_message_id: 42,
  action_type: "pause_active_plan",
  status: "proposed",
  request_payload: { internal: "DO_NOT_LEAK_req" },
  preview_payload: { internal: "DO_NOT_LEAK_prev" },
  result_payload: { internal: "DO_NOT_LEAK_res" },
  failure_reason: null,
  created_at: "2026-05-13T10:00:00Z",
  updated_at: "2026-05-13T10:00:00Z",
};

describe("GET /api/assistant/action-runs (CP9 closure-pass dedicated read)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await GET(new NextRequest("http://app.test/api/assistant/action-runs"));
    expect(r.status).toBe(401);
  });

  test("returns PublicAssistantActionRun[] with NO *_payload leak; unknown action_type still classified", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([
      {
        status: 200,
        body: [run, { ...run, id: 72, action_type: "future_unknown_action" }],
      },
    ]);
    const r = await GET(new NextRequest("http://app.test/api/assistant/action-runs"));
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json[0].actionTypeLabel).toBe("Pause active plan");
    expect(json[0].isKnownActionType).toBe(true);
    expect(json[1].isKnownActionType).toBe(false);
    expect(json[1].actionTypeLabel).toBe("Future Unknown Action");
    const text = JSON.stringify(json);
    expect(text).not.toContain("request_payload");
    expect(text).not.toContain("preview_payload");
    expect(text).not.toContain("result_payload");
    expect(text).not.toContain("DO_NOT_LEAK");
    expect(text).not.toContain("user_id");
  });

  test("forwards conversation_id query when valid; drops invalid", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([
      { status: 200, body: [] },
      { status: 200, body: [] },
    ]);
    await GET(new NextRequest("http://app.test/api/assistant/action-runs?conversation_id=11"));
    expect(String(spy.mock.calls[0]![0])).toContain("conversation_id=11");
    await GET(new NextRequest("http://app.test/api/assistant/action-runs?conversation_id=abc"));
    expect(String(spy.mock.calls[1]![0])).not.toContain("conversation_id=abc");
  });
});
