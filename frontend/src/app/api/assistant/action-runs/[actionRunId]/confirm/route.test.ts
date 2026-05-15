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

const actionRun = {
  id: 71,
  user_id: 270,
  conversation_id: 11,
  source_message_id: 42,
  action_type: "pause_active_plan",
  status: "executed",
  request_payload: { internal: "DO_NOT_LEAK_request" },
  preview_payload: { internal: "DO_NOT_LEAK_preview" },
  result_payload: { internal: "DO_NOT_LEAK_result" },
  failure_reason: null,
  created_at: "2026-05-13T10:00:05Z",
  updated_at: "2026-05-13T10:00:10Z",
};

describe("POST /api/assistant/action-runs/[actionRunId]/confirm (CP9)", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401, no backend call", async () => {
    const spy = stubFetch([]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/action-runs/71/confirm", { method: "POST" }),
      { params: Promise.resolve({ actionRunId: "71" }) },
    );
    expect(r.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  test("non-numeric actionRunId → 422 without backend call", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const spy = stubFetch([]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/action-runs/abc/confirm", { method: "POST" }),
      { params: Promise.resolve({ actionRunId: "abc" }) },
    );
    expect(r.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  test("forwards POST to backend, returns PublicAssistantActionRun with no payload leak", async () => {
    jar._store.set("sola_access", { value: "ACC_AR", options: {} });
    const spy = stubFetch([{ status: 200, body: actionRun, headers: { "x-request-id": "req-ar-1" } }]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/action-runs/71/confirm", { method: "POST" }),
      { params: Promise.resolve({ actionRunId: "71" }) },
    );
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.id).toBe(71);
    expect(json.actionType).toBe("pause_active_plan");
    expect(json.actionTypeLabel).toBe("Pause active plan");
    expect(json.isKnownActionType).toBe(true);
    expect(json.statusLabel).toBe("Completed");
    expect(json.failureReasonLabel).toBeNull();

    const init = spy.mock.calls[0]![1] as unknown as { method: string; headers: Record<string, string>; body?: unknown };
    expect(String(spy.mock.calls[0]![0])).toContain("/assistant/action-runs/71/confirm");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer ACC_AR");
    expect(init.body).toBeUndefined();

    const text = JSON.stringify(json);
    expect(text).not.toContain("request_payload");
    expect(text).not.toContain("preview_payload");
    expect(text).not.toContain("result_payload");
    expect(text).not.toContain("DO_NOT_LEAK");
    expect(text).not.toContain("user_id");
  });

  test("unknown action type still surfaces safely as not-known", async () => {
    jar._store.set("sola_access", { value: "ACC_AR", options: {} });
    stubFetch([
      {
        status: 200,
        body: {
          ...actionRun,
          action_type: "totally_new_action",
          status: "failed",
          failure_reason: "completely_new_reason",
        },
      },
    ]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/action-runs/71/confirm", { method: "POST" }),
      { params: Promise.resolve({ actionRunId: "71" }) },
    );
    const json = await r.json();
    expect(json.actionType).toBe("totally_new_action");
    expect(json.isKnownActionType).toBe(false);
    expect(json.actionTypeLabel).toBe("Totally New Action");
    expect(json.failureReasonLabel).toBe("The action could not complete.");
  });

  test("backend 422 propagates safe envelope", async () => {
    jar._store.set("sola_access", { value: "ACC_AR", options: {} });
    stubFetch([
      {
        status: 422,
        body: {
          detail: "Action cannot be confirmed.",
          error_code: "validation_error",
          request_id: "req-ar-422",
        },
      },
    ]);
    const r = await POST(
      new NextRequest("http://app.test/api/assistant/action-runs/71/confirm", { method: "POST" }),
      { params: Promise.resolve({ actionRunId: "71" }) },
    );
    expect(r.status).toBe(422);
  });
});
