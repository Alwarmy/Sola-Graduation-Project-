import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { GET } from "./route";

describe("GET /api/auth/session", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("no access cookie: returns anonymous without backend call", async () => {
    const fetchSpy = stubFetch([]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("with access cookie: calls /auth/me with bearer and returns PublicSession", async () => {
    jar._store.set(ACCESS_TOKEN_COOKIE, { value: "ACC", options: {} });
    const fetchSpy = stubFetch([
      { status: 200, body: { id: 9, email: "u@example.com", full_name: "U Person" } },
    ]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id: 9, email: "u@example.com", fullName: "U Person" } });

    const init = fetchSpy.mock.calls[0]![1] as unknown as { headers: Record<string, string> };
    expect(init.headers.authorization).toBe("Bearer ACC");
  });

  test("backend 401: returns anonymous (does not throw)", async () => {
    jar._store.set(ACCESS_TOKEN_COOKIE, { value: "STALE", options: {} });
    stubFetch([{ status: 401, body: { detail: "Not authenticated" } }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
  });
});
