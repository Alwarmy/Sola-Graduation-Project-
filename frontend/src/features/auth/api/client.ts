"use client";

import { BackendError, type BackendErrorDetails } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import { intentForErrorCode } from "@/lib/errors/error-codes";

/**
 * Browser-only fetcher for `/api/auth/*`.
 *
 * Hooks call this. It never touches the SOLA backend directly — every call
 * goes through the dedicated Next.js auth handlers, which own the HttpOnly
 * cookie boundary.
 *
 * Returns parsed JSON on 2xx. Throws a `BackendError` on non-2xx so consumers
 * can switch on `error.intent` for login/retry/validation/rate-limited UX
 * exactly the same way they will switch on errors from feature queries later.
 */
export async function authFetch<T>(
  path: `/api/auth/${string}`,
  init?: {
    method?: "GET" | "POST";
    json?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init?.json !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    signal: init?.signal,
    credentials: "same-origin",
    cache: "no-store",
  });

  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    const obj = (body ?? {}) as {
      detail?: unknown;
      error_code?: unknown;
      request_id?: unknown;
      details?: unknown;
    };
    throw new BackendError({
      status: response.status,
      detail: typeof obj.detail === "string" ? obj.detail : `Request failed (${response.status})`,
      errorCode: typeof obj.error_code === "string" ? obj.error_code : undefined,
      requestId: typeof obj.request_id === "string" ? obj.request_id : requestId,
      details:
        obj.details && typeof obj.details === "object" ? (obj.details as BackendErrorDetails) : undefined,
    });
  }

  return body as T;
}

// Re-export the intent helper so feature hooks can route errors to UX flows
// without importing from deep in `lib/errors/...`.
export { intentForErrorCode };
