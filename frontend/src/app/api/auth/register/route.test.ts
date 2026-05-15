import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeCookieJar, stubFetch, clearStubs } from "@/test/auth-helpers";

vi.stubEnv("SOLA_BACKEND_URL", "http://backend.test");
vi.stubEnv("NEXT_PUBLIC_SOLA_APP_URL", "http://app.test");

const jar = makeCookieJar();
vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));

import { POST } from "./route";

function makeRequest(payload: unknown): Request {
  return new Request("http://app.test/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => jar._store.clear());
  afterEach(() => {
    clearStubs();
    vi.resetModules();
  });

  test("happy path: returns safe user shape, NO cookies set, NO tokens", async () => {
    stubFetch([
      {
        status: 201,
        body: { id: 7, email: "newuser@example.com", full_name: "New User" },
        headers: { "x-request-id": "req-r1" },
      },
    ]);
    const response = await POST(
      makeRequest({
        email: "newuser@example.com",
        full_name: "New User",
        password: "secret123",
      }) as never,
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toEqual({ user: { id: 7, email: "newuser@example.com", fullName: "New User" } });
    expect(jar._store.size).toBe(0);
    const stringified = JSON.stringify(json);
    expect(stringified).not.toContain("access_token");
    expect(stringified).not.toContain("refresh_token");
  });

  test("invalid input (short password): 422 with field errors, no fetch made", async () => {
    const fetchSpy = stubFetch([]);
    const response = await POST(
      makeRequest({ email: "ok@example.com", full_name: "A", password: "12345" }) as never,
    );
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error_code).toBe("request_validation_error");
    expect(Array.isArray(json.details?.errors)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("backend 409 conflict / 422 propagates safe envelope", async () => {
    stubFetch([
      {
        status: 409,
        body: {
          detail: "Email already registered.",
          error_code: "email_already_registered",
          request_id: "req-r2",
        },
      },
    ]);
    const response = await POST(
      makeRequest({
        email: "taken@example.com",
        full_name: "Taken",
        password: "secret123",
      }) as never,
    );
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error_code).toBe("email_already_registered");
    expect(jar._store.size).toBe(0);
  });
});
