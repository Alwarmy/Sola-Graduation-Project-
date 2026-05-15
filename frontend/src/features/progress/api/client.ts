"use client";

import { BackendError, type BackendErrorDetails } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * Browser-only fetcher for the CP11 dedicated handlers. Same pattern as
 * the CP10 hardening `plansSafeFetch` — the dedicated handlers already
 * produced the safe Public shape server-side, so this helper just
 * forwards typed JSON straight through. Errors come back as
 * `BackendError` so consumers can switch on `error.intent`.
 */

type FetchInit = {
  method?: "GET" | "POST";
  signal?: AbortSignal;
};

export async function progressDedicatedFetch<T>(
  url: `/api/${"events" | "learning-state"}${string}`,
  init: FetchInit = {},
): Promise<T> {
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: { accept: "application/json" },
    signal: init.signal,
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
