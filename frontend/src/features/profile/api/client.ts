"use client";

import { BackendError, type BackendErrorDetails } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * Browser-only fetcher for profile endpoints. Routes through the CP2
 * authenticated catch-all gateway at `/api/sola/...` so the access cookie
 * is read server-side and never exposed to the browser.
 */
export async function profileFetch<T>(
  backendPath: `/${string}`,
  init?: { method?: "GET" | "POST" | "PUT"; json?: unknown; signal?: AbortSignal },
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init?.json !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`/api/sola${backendPath}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    signal: init?.signal,
    credentials: "same-origin",
    cache: "no-store",
  });

  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => undefined)
    : undefined;

  if (!response.ok) {
    const obj = (body ?? {}) as {
      detail?: unknown;
      error_code?: unknown;
      request_id?: unknown;
      details?: unknown;
    };
    throw new BackendError({
      status: response.status,
      detail:
        typeof obj.detail === "string" ? obj.detail : `Request failed (${response.status})`,
      errorCode: typeof obj.error_code === "string" ? obj.error_code : undefined,
      requestId: typeof obj.request_id === "string" ? obj.request_id : requestId,
      details:
        obj.details && typeof obj.details === "object"
          ? (obj.details as BackendErrorDetails)
          : undefined,
    });
  }

  return body as T;
}
