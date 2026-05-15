"use client";

import { BackendError, type BackendErrorDetails } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * Browser-only fetchers for the courses feature.
 *
 * - `solaFetch` — CP2 authenticated catch-all proxy at `/api/sola/...`.
 *   Used only for routes whose CP6 classification is authenticated-required
 *   (recommendations, course-structures, units).
 * - `coursesFetch` — CP6-hardened dedicated optional-auth handlers at
 *   `/api/courses` and `/api/courses/[courseId]`. Used by catalog + detail
 *   hooks so anonymous browsing works.
 * - `courseSearchFetch` — CP6-owned pipeline orchestrator at
 *   `/api/courses/search`. POSTs the search payload; never exposes ingest.
 *
 * All three throw `BackendError` on non-2xx with the standard envelope.
 */

type FetchInit = {
  method?: "GET" | "POST";
  json?: unknown;
  signal?: AbortSignal;
};

async function doFetch<T>(url: string, init: FetchInit): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.json !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
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

export async function solaFetch<T>(
  backendPath: `/${string}`,
  init: FetchInit = {},
): Promise<T> {
  return doFetch<T>(`/api/sola${backendPath}`, init);
}

/**
 * Optional-auth catalog/detail through the CP6-hardened dedicated handlers.
 * Pass a relative path like `/api/courses` or `/api/courses/123`.
 */
export async function coursesFetch<T>(
  url: `/api/courses${string}`,
  init: FetchInit = {},
): Promise<T> {
  return doFetch<T>(url, init);
}

export async function courseSearchFetch<T>(payload: unknown, signal?: AbortSignal): Promise<T> {
  return doFetch<T>("/api/courses/search", { method: "POST", json: payload, signal });
}
