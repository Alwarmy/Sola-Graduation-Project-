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

const rotatedToken = {
  access_token: "ACC2_redacted",
  refresh_token: "REF2_redacted",
  token_type: "bearer",
  access_token_expires_in_seconds: 900,
  refresh_token_expires_in_seconds: 1209600,
  session_id: "sid2_redacted",
};

const me = { id: 11, email: "u@example.com", full_name: "U" };

describe("POST /api/auth/refresh", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("no refresh cookie: returns anonymous without calling backend", async () => {
    const fetchSpy = stubFetch([]);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("happy path: forwards refresh_token in body, rotates cookies, returns PublicSession", async () => {
    jar._store.set(REFRESH_TOKEN_COOKIE, { value: "OLD_REF", options: {} });
    const fetchSpy = stubFetch([
      { status: 200, body: rotatedToken, headers: { "x-request-id": "req-rf" } },
      { status: 200, body: me },
    ]);

    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: { id: 11, email: "u@example.com", fullName: "U" } });

    // First call was /auth/refresh with the OLD refresh token in JSON body.
    const firstCall = fetchSpy.mock.calls[0]!;
    expect(String(firstCall[0])).toContain("/auth/refresh");
    const firstInit = firstCall[1] as unknown as { body?: string };
    expect(firstInit.body).toBe(JSON.stringify({ refresh_token: "OLD_REF" }));

    // All three cookies rotated to the new token values, still HttpOnly.
    expect(jar._store.get(ACCESS_TOKEN_COOKIE)?.value).toBe("ACC2_redacted");
    expect(jar._store.get(REFRESH_TOKEN_COOKIE)?.value).toBe("REF2_redacted");
    expect(jar._store.get(SESSION_ID_COOKIE)?.value).toBe("sid2_redacted");
    expect(jar._store.get(ACCESS_TOKEN_COOKIE)?.options.httpOnly).toBe(true);
  });

  test("backend 401 on refresh: cookies are cleared and anonymous is returned", async () => {
    jar._store.set(REFRESH_TOKEN_COOKIE, { value: "STALE", options: {} });
    jar._store.set(ACCESS_TOKEN_COOKIE, { value: "STALE_ACC", options: {} });
    jar._store.set(SESSION_ID_COOKIE, { value: "STALE_SID", options: {} });

    stubFetch([
      {
        status: 401,
        body: { detail: "Invalid refresh token", error_code: "invalid_refresh_token" },
      },
    ]);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null });

    // Cookies cleared (maxAge=0 + empty value).
    expect(jar._store.get(ACCESS_TOKEN_COOKIE)?.value).toBe("");
    expect(jar._store.get(REFRESH_TOKEN_COOKIE)?.value).toBe("");
    expect(jar._store.get(SESSION_ID_COOKIE)?.value).toBe("");
  });
});
