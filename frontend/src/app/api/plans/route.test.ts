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

const planResponse = {
  id: 9,
  user_id: 266,
  title: "Master Python",
  goal: "Land a job",
  status: "active",
  version: 1,
  schedule_revision: 0,
  current_focus_snapshot: null,
  weekly_hours_snapshot: 10,
  schedule_timezone_snapshot: "Asia/Riyadh",
  created_at: "2026-05-13T08:00:00Z",
  updated_at: "2026-05-13T08:10:00Z",
  preference: null,
  courses: [],
};

function makeJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/plans", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("anonymous → 401", async () => {
    const fetchSpy = stubFetch([]);
    const response = await POST(
      makeJsonRequest("http://app.test/api/plans", {
        title: "T",
        goal: "G",
        queue_item_ids: [1],
      }),
    );
    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("client-side validation: empty title, empty goal, no queue_item_ids → 422", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const fetchSpy = stubFetch([]);
    const bads: unknown[] = [
      { title: "", goal: "G", queue_item_ids: [1] },
      { title: "T", goal: "", queue_item_ids: [1] },
      { title: "T", goal: "G", queue_item_ids: [] },
      { title: "T", goal: "G", queue_item_ids: [1, 2, 3, 4] },
    ];
    for (const bad of bads) {
      const response = await POST(makeJsonRequest("http://app.test/api/plans", bad));
      expect(response.status).toBe(422);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("creates plan and returns 201 with PublicLearningPlan", async () => {
    jar._store.set("sola_access", { value: "ACC", options: {} });
    const fetchSpy = stubFetch([{ status: 201, body: planResponse }]);
    const response = await POST(
      makeJsonRequest("http://app.test/api/plans", {
        title: "Master Python",
        goal: "Land a job",
        queue_item_ids: [11, 12],
      }),
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe(9);
    expect(json.version).toBe(1);
    expect(json.statusLabel).toBe("Active");
    expect(JSON.stringify(json)).not.toContain("user_id");

    const callUrl = String(fetchSpy.mock.calls[0]![0]);
    expect(callUrl).toContain("/plans");
    const callInit = fetchSpy.mock.calls[0]![1] as unknown as {
      method: string;
      headers: Record<string, string>;
      body: string;
    };
    expect(callInit.method).toBe("POST");
    expect(callInit.headers.authorization).toBe("Bearer ACC");
    expect(JSON.parse(callInit.body).queue_item_ids).toEqual([11, 12]);
  });
});
