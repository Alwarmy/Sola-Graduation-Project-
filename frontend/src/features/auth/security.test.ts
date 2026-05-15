import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

const TOKEN_KEYS = ["access_token", "refresh_token", "session_id"] as const;
const TOKEN_VALUES = ["ACC_X_redacted", "REF_X_redacted", "SID_X_redacted"];

function assertNoTokenLeak(json: unknown) {
  const stringified = JSON.stringify(json ?? null);
  for (const key of TOKEN_KEYS) {
    expect(stringified, `response leaked key ${key}`).not.toContain(key);
  }
  for (const value of TOKEN_VALUES) {
    expect(stringified, `response leaked value ${value}`).not.toContain(value);
  }
}

describe("Auth Gateway: no token ever leaves the server", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("login response body contains no token keys/values", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    stubFetch([
      {
        status: 200,
        body: {
          access_token: TOKEN_VALUES[0],
          refresh_token: TOKEN_VALUES[1],
          token_type: "bearer",
          access_token_expires_in_seconds: 900,
          refresh_token_expires_in_seconds: 1209600,
          session_id: TOKEN_VALUES[2],
        },
      },
      { status: 200, body: { id: 1, email: "u@example.com", full_name: "U" } },
    ]);
    const request = new Request("http://app.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "u@example.com", password: "secret123" }),
    });
    const response = await POST(request as never);
    const json = await response.json();
    assertNoTokenLeak(json);
  });

  test("refresh response body contains no token keys/values", async () => {
    const { POST } = await import("@/app/api/auth/refresh/route");
    jar._store.set("sola_refresh", { value: "OLD", options: {} });
    stubFetch([
      {
        status: 200,
        body: {
          access_token: TOKEN_VALUES[0],
          refresh_token: TOKEN_VALUES[1],
          token_type: "bearer",
          access_token_expires_in_seconds: 900,
          refresh_token_expires_in_seconds: 1209600,
          session_id: TOKEN_VALUES[2],
        },
      },
      { status: 200, body: { id: 1, email: "u@example.com", full_name: "U" } },
    ]);
    const response = await POST();
    const json = await response.json();
    assertNoTokenLeak(json);
  });

  test("logout response body contains no token keys/values", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    jar._store.set("sola_refresh", { value: "REF", options: {} });
    stubFetch([{ status: 204 }]);
    const response = await POST();
    const json = await response.json();
    assertNoTokenLeak(json);
  });

  test("session response body contains no token keys/values", async () => {
    const { GET } = await import("@/app/api/auth/session/route");
    jar._store.set("sola_access", { value: "ACC", options: {} });
    stubFetch([{ status: 200, body: { id: 1, email: "u@example.com", full_name: "U" } }]);
    const response = await GET();
    const json = await response.json();
    assertNoTokenLeak(json);
  });

  test("register response body contains no token keys/values", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    stubFetch([
      { status: 201, body: { id: 1, email: "u@example.com", full_name: "U" } },
    ]);
    const request = new Request("http://app.test/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "u@example.com", full_name: "U", password: "secret123" }),
    });
    const response = await POST(request as never);
    const json = await response.json();
    assertNoTokenLeak(json);
  });
});
