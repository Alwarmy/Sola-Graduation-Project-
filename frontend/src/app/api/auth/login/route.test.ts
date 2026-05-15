import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

// Wire up env BEFORE the route module is loaded — env.ts caches on first read.
vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

// Mock next/headers to provide our own cookie jar.
const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { POST } from "./route";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_ID_COOKIE,
} from "@/lib/auth/cookies";

function makeRequest(payload: unknown): Request {
  return new Request("http://app.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

const validToken = {
  access_token: "ACC_test_redacted",
  refresh_token: "REF_test_redacted",
  token_type: "bearer",
  access_token_expires_in_seconds: 900,
  refresh_token_expires_in_seconds: 60 * 60 * 24 * 14,
  session_id: "sid_test_redacted",
};

const validUser = { id: 42, email: "user@example.com", full_name: "Test User" };

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    jar._store.clear();
  });
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("happy path: writes HttpOnly cookies and returns PublicSession without tokens", async () => {
    stubFetch([
      { status: 200, body: validToken, headers: { "x-request-id": "req-1" } },
      { status: 200, body: validUser, headers: { "x-request-id": "req-2" } },
    ]);

    const response = await POST(makeRequest({ email: "user@example.com", password: "secret123" }) as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      user: { id: 42, email: "user@example.com", fullName: "Test User" },
    });
    // The response body must NOT contain tokens under any key.
    const stringified = JSON.stringify(json);
    expect(stringified).not.toContain("access_token");
    expect(stringified).not.toContain("refresh_token");
    expect(stringified).not.toContain("ACC_test_redacted");
    expect(stringified).not.toContain("REF_test_redacted");

    // All three cookies were set with HttpOnly true.
    for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, SESSION_ID_COOKIE]) {
      const entry = jar._store.get(name);
      expect(entry).toBeDefined();
      expect(entry?.options.httpOnly).toBe(true);
      expect(entry?.options.sameSite).toBe("lax");
    }
  });

  test("invalid input: 422 with safe envelope, no fetch made", async () => {
    const fetchSpy = stubFetch([]); // No responses queued; we expect zero calls.
    const response = await POST(makeRequest({ email: "not-an-email", password: "" }) as never);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error_code).toBe("request_validation_error");
    expect(fetchSpy).not.toHaveBeenCalled();
    // No cookies written.
    expect(jar._store.size).toBe(0);
  });

  test("backend 401 invalid_credentials: propagates safe envelope, no cookies", async () => {
    stubFetch([
      {
        status: 401,
        body: {
          detail: "Invalid email or password.",
          error_code: "invalid_credentials",
          request_id: "req-err-1",
        },
        headers: { "x-request-id": "req-err-1" },
      },
    ]);
    const response = await POST(makeRequest({ email: "user@example.com", password: "wrong" }) as never);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error_code).toBe("invalid_credentials");
    expect(json.detail).toBe("Invalid email or password.");
    expect(json.request_id).toBe("req-err-1");
    // No tokens leaked, no cookies set.
    expect(JSON.stringify(json)).not.toContain("access_token");
    expect(JSON.stringify(json)).not.toContain("refresh_token");
    expect(jar._store.size).toBe(0);
  });
});
