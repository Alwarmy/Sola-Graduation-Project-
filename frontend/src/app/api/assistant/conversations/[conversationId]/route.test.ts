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

const detail = {
  id: 11,
  user_id: 270,
  title: "Help with Python",
  status: "active",
  conversation_metadata: { internal: "DO_NOT_LEAK_meta" },
  last_user_message_at: "2026-05-13T10:00:00Z",
  last_assistant_message_at: "2026-05-13T10:00:05Z",
  created_at: "2026-05-13T09:30:00Z",
  updated_at: "2026-05-13T10:00:05Z",
  contract_version: "assistant_v1",
  message_count: 2,
  active_memory_signal_count: 1,
  pending_action_count: 1,
  messages: [
    {
      id: 41,
      conversation_id: 11,
      user_id: 270,
      role: "user",
      content: "Hi",
      message_intent: null,
      message_metadata: { internal: "DO_NOT_LEAK_meta" },
      context_snapshot: { internal: "DO_NOT_LEAK_ctx" },
      created_at: "2026-05-13T10:00:00Z",
    },
  ],
  recent_action_runs: [
    {
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
      created_at: "2026-05-13T10:00:05Z",
      updated_at: "2026-05-13T10:00:05Z",
    },
  ],
  effective_memory_signals: [
    {
      id: 91,
      user_id: 270,
      conversation_id: 11,
      source_message_id: 41,
      signal_type: "schedule_preference",
      signal_key: "preferred_time_window",
      signal_summary: "Prefers evenings.",
      signal_value: { internal: "DO_NOT_LEAK_val" },
      signal_metadata: { internal: "DO_NOT_LEAK_meta" },
      scope: "durable_preference",
      confidence_score: 0.9,
      status: "active",
      effective_from: null,
      expires_at: null,
      created_at: "2026-05-13T10:00:05Z",
      updated_at: "2026-05-13T10:00:05Z",
    },
  ],
};

describe("GET /api/assistant/conversations/[conversationId] (CP9 closure-pass)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await GET(new NextRequest("http://app.test/api/assistant/conversations/11"), {
      params: Promise.resolve({ conversationId: "11" }),
    });
    expect(r.status).toBe(401);
  });

  test("non-numeric id → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await GET(new NextRequest("http://app.test/api/assistant/conversations/abc"), {
      params: Promise.resolve({ conversationId: "abc" }),
    });
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicAssistantConversationDetail with zero internal leaks", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: detail }]);
    const r = await GET(new NextRequest("http://app.test/api/assistant/conversations/11"), {
      params: Promise.resolve({ conversationId: "11" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.messageCount).toBe(2);
    expect(json.activeMemorySignalCount).toBe(1);
    expect(json.pendingActionCount).toBe(1);
    expect(json.messages).toHaveLength(1);
    expect(json.recentActionRuns).toHaveLength(1);
    expect(json.effectiveMemorySignals).toHaveLength(1);

    const text = JSON.stringify(json);
    // None of the internal dicts reach the browser.
    expect(text).not.toContain("conversation_metadata");
    expect(text).not.toContain("message_metadata");
    expect(text).not.toContain("context_snapshot");
    expect(text).not.toContain("signal_value");
    expect(text).not.toContain("signal_metadata");
    expect(text).not.toContain("request_payload");
    expect(text).not.toContain("preview_payload");
    expect(text).not.toContain("result_payload");
    expect(text).not.toContain("contract_summary");
    expect(text).not.toContain("lifecycle_summary");
    expect(text).not.toContain("DO_NOT_LEAK");
    expect(text).not.toContain("user_id");
  });
});
