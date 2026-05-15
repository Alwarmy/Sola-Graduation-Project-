import { describe, expect, test } from "vitest";

import { BackendError, parseBackendError } from "@/lib/errors/backend-error";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("parseBackendError", () => {
  test("parses FastAPI default 401 (no error_code, no request_id in body)", async () => {
    const res = jsonResponse(
      401,
      { detail: "Not authenticated" },
      { "x-request-id": "req-aaa" },
    );
    const err = await parseBackendError(res);
    expect(err).toBeInstanceOf(BackendError);
    expect(err.status).toBe(401);
    expect(err.detail).toBe("Not authenticated");
    expect(err.errorCode).toBeUndefined();
    // request id comes from the header.
    expect(err.requestId).toBe("req-aaa");
    expect(err.intent).toBe("login");
  });

  test("parses custom AppException 401 (invalid_credentials)", async () => {
    const res = jsonResponse(
      401,
      {
        detail: "Invalid email or password.",
        error_code: "invalid_credentials",
        request_id: "req-bbb",
      },
      { "x-request-id": "req-bbb" },
    );
    const err = await parseBackendError(res);
    expect(err.status).toBe(401);
    expect(err.errorCode).toBe("invalid_credentials");
    expect(err.detail).toBe("Invalid email or password.");
    expect(err.requestId).toBe("req-bbb");
    expect(err.intent).toBe("login");
  });

  test("parses 422 request_validation_error and projects field errors", async () => {
    const res = jsonResponse(
      422,
      {
        detail: "Request validation failed.",
        error_code: "request_validation_error",
        request_id: "req-ccc",
        details: {
          errors: [
            { type: "missing", loc: ["body", "email"], msg: "Field required", input: {} },
            { type: "missing", loc: ["body", "password"], msg: "Field required", input: {} },
          ],
        },
      },
      { "x-request-id": "req-ccc" },
    );
    const err = await parseBackendError(res);
    expect(err.status).toBe(422);
    expect(err.errorCode).toBe("request_validation_error");
    expect(err.intent).toBe("validation");
    const fieldErrors = err.fieldErrors();
    expect(fieldErrors).toHaveLength(2);
    expect(fieldErrors[0]).toMatchObject({ loc: ["body", "email"], message: "Field required" });
    expect(fieldErrors[1]).toMatchObject({ loc: ["body", "password"], message: "Field required" });
  });

  test("falls back to defaults when body has no JSON", async () => {
    const res = new Response("oops", {
      status: 500,
      headers: { "content-type": "text/plain", "x-request-id": "req-ddd" },
    });
    const err = await parseBackendError(res);
    expect(err.status).toBe(500);
    expect(err.detail).toBe("Backend unavailable");
    expect(err.intent).toBe("unavailable");
    expect(err.requestId).toBe("req-ddd");
  });

  test("uses header request id when body omits it", async () => {
    const res = jsonResponse(
      404,
      { detail: "Not found", error_code: "not_found" },
      { "x-request-id": "req-eee" },
    );
    const err = await parseBackendError(res);
    expect(err.requestId).toBe("req-eee");
    expect(err.intent).toBe("not-found");
  });

  test("fieldErrors returns [] for non-validation errors", async () => {
    const res = jsonResponse(401, { detail: "Not authenticated" });
    const err = await parseBackendError(res);
    expect(err.fieldErrors()).toEqual([]);
  });
});
