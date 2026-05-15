import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_ID_COOKIE,
} from "@/lib/auth/cookies";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("no cookie: clears (no-op) and returns anonymous", async () => {
    const fetchSpy = stubFetch([]);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("happy path: forwards refresh_token in JSON body and clears cookies", async () => {
    jar._store.set(ACCESS_TOKEN_COOKIE, { value: "ACC", options: {} });
    jar._store.set(REFRESH_TOKEN_COOKIE, { value: "REF", options: {} });
    jar._store.set(SESSION_ID_COOKIE, { value: "SID", options: {} });

    const fetchSpy = stubFetch([{ status: 204 }]);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain("/auth/logout");
    const init = call[1] as unknown as { body?: string };
    expect(init.body).toBe(JSON.stringify({ refresh_token: "REF" }));

    // Cookies cleared.
    expect(jar._store.get(ACCESS_TOKEN_COOKIE)?.value).toBe("");
    expect(jar._store.get(REFRESH_TOKEN_COOKIE)?.value).toBe("");
    expect(jar._store.get(SESSION_ID_COOKIE)?.value).toBe("");
  });

  test("backend failure during logout still clears local cookies", async () => {
    jar._store.set(REFRESH_TOKEN_COOKIE, { value: "REF", options: {} });
    stubFetch([{ status: 500, body: { detail: "Backend unavailable" } }]);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(jar._store.get(REFRESH_TOKEN_COOKIE)?.value).toBe("");
  });
});
