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

const governance = {
  status: "ready",
  intent: "schedule_support",
  answer_strategy: "schedule_guidance",
  blocking_reason: null,
  requires_clarification: false,
  can_extract_memory: true,
  can_suggest_actions: true,
  has_active_plan: true,
  has_recovery_preview: false,
  has_recommendations: false,
  has_next_actionable_item: true,
  concept_label: null,
};

const messageBase = {
  conversation_id: 11,
  user_id: 270,
  message_intent: "schedule_support",
  message_metadata: { internal: "DO_NOT_LEAK_meta" },
  context_snapshot: { internal: "DO_NOT_LEAK_snapshot" },
  created_at: "2026-05-13T10:00:00Z",
};

const exchange = {
  contract_version: "assistant_v1",
  conversation: {
    id: 11,
    user_id: 270,
    title: "Schedule",
    status: "active",
    conversation_metadata: {},
    last_user_message_at: "2026-05-13T10:00:00Z",
    last_assistant_message_at: "2026-05-13T10:00:05Z",
    created_at: "2026-05-13T09:30:00Z",
    updated_at: "2026-05-13T10:00:05Z",
  },
  user_message: { ...messageBase, id: 41, role: "user", content: "I prefer evenings." },
  assistant_message: {
    ...messageBase,
    id: 42,
    role: "assistant",
    content: "Noted — I'll keep evenings as your preferred window.",
    response_mode: "schedule_guidance",
    governance,
  },
  response_mode: "schedule_guidance",
  grounded_entities: [
    {
      entity_type: "learning_plan",
      entity_id: 201,
      label: "Master Python",
      metadata: { internal: "DO_NOT_LEAK_entity_meta" },
    },
  ],
  used_context_summary: { internal: "DO_NOT_LEAK_context" },
  suggested_actions: [
    {
      action_run_id: 71,
      action_type: "pause_active_plan",
      title: "Pause active plan",
      summary: "Pause it for now.",
      requires_confirmation: true,
      preview_payload: { internal: "DO_NOT_LEAK_preview" },
    },
  ],
  memory_candidates: [
    {
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
      confidence_score: 0.9,
      status: "proposed",
      effective_from: null,
      expires_at: null,
      created_at: "2026-05-13T10:00:05Z",
      updated_at: "2026-05-13T10:00:05Z",
    },
  ],
  follow_up_questions: ["Want me to set a weekly cap?"],
  governance,
};

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("http://app.test/api/assistant/conversations/11/messages", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/assistant/conversations/[conversationId]/messages (CP9)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await POST(jsonReq({ content: "hi" }), {
      params: Promise.resolve({ conversationId: "11" }),
    });
    expect(r.status).toBe(401);
  });

  test("non-numeric conversationId → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await POST(jsonReq({ content: "hi" }), {
      params: Promise.resolve({ conversationId: "abc" }),
    });
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("empty / too-long content → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    for (const bad of [{}, { content: "" }, { content: "a".repeat(4001) }]) {
      const r = await POST(jsonReq(bad), {
        params: Promise.resolve({ conversationId: "11" }),
      });
      expect(r.status).toBe(422);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards content + bearer and returns PublicAssistantExchange with safe labels and zero leaks", async () => {
    jar._store.set("sola_access", { value: "ACC_M", options: {} });
    const spy = stubFetch([
      { status: 200, body: exchange, headers: { "x-request-id": "req-m-1" } },
    ]);
    const r = await POST(jsonReq({ content: "I prefer evenings." }), {
      params: Promise.resolve({ conversationId: "11" }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.assistantMessage.content).toBe(
      "Noted — I'll keep evenings as your preferred window.",
    );
    expect(json.responseModeLabel).toBe("Schedule guidance");
    expect(json.governance.statusLabel).toBe("Ready");
    expect(json.suggestedActions[0].actionRunId).toBe(71);
    expect(json.suggestedActions[0].actionTypeLabel).toBe("Pause active plan");
    expect(json.memoryCandidates[0].statusLabel).toBe("Proposed");
    expect(json.memoryCandidates[0].scopeLabel).toBe("Long-term preference");
    expect(json.groundedEntities[0].entityTypeLabel).toBe("Plan");
    expect(r.headers.get("x-request-id")).toBe("req-m-1");

    // Backend got the exact body + bearer.
    const init = spy.mock.calls[0]![1] as unknown as { headers: Record<string, string>; body: string };
    expect(String(spy.mock.calls[0]![0])).toContain("/assistant/conversations/11/messages");
    expect(init.headers.authorization).toBe("Bearer ACC_M");
    expect(JSON.parse(init.body)).toEqual({ content: "I prefer evenings." });

    // No internal leaks of any kind in the response that reaches the browser.
    const text = JSON.stringify(json);
    expect(text).not.toContain("used_context_summary");
    expect(text).not.toContain("message_metadata");
    expect(text).not.toContain("context_snapshot");
    expect(text).not.toContain("signal_value");
    expect(text).not.toContain("signal_metadata");
    expect(text).not.toContain("preview_payload");
    expect(text).not.toContain("request_payload");
    expect(text).not.toContain("result_payload");
    expect(text).not.toContain("DO_NOT_LEAK");
    expect(text).not.toContain("access_token");
  });

  test("backend 422 propagates safe envelope without backend internal text", async () => {
    jar._store.set("sola_access", { value: "ACC_M", options: {} });
    stubFetch([
      {
        status: 422,
        body: {
          detail: "Request validation failed.",
          error_code: "request_validation_error",
          request_id: "req-m-422",
        },
      },
    ]);
    const r = await POST(jsonReq({ content: "x" }), {
      params: Promise.resolve({ conversationId: "11" }),
    });
    expect(r.status).toBe(422);
  });
});

describe("GET /api/assistant/conversations/[conversationId]/messages (CP9 closure-pass dedicated read)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const r = await GET(
      new NextRequest("http://app.test/api/assistant/conversations/11/messages"),
      { params: Promise.resolve({ conversationId: "11" }) },
    );
    expect(r.status).toBe(401);
  });

  test("non-numeric id → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await GET(
      new NextRequest("http://app.test/api/assistant/conversations/abc/messages"),
      { params: Promise.resolve({ conversationId: "abc" }) },
    );
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("returns PublicAssistantMessage[] with NO message_metadata / context_snapshot leak", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([
      {
        status: 200,
        body: [exchange.user_message, exchange.assistant_message],
      },
    ]);
    const r = await GET(
      new NextRequest("http://app.test/api/assistant/conversations/11/messages"),
      { params: Promise.resolve({ conversationId: "11" }) },
    );
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json).toHaveLength(2);
    expect(json[0].roleLabel).toBe("You");
    expect(json[1].roleLabel).toBe("Assistant");
    const text = JSON.stringify(json);
    expect(text).not.toContain("message_metadata");
    expect(text).not.toContain("context_snapshot");
    expect(text).not.toContain("DO_NOT_LEAK");
    expect(text).not.toContain("user_id");
  });
});
