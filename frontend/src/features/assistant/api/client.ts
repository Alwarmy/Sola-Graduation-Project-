"use client";

import { BackendError, type BackendErrorDetails } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * Browser-only fetcher for assistant feature.
 *
 * - Authenticated reads (conversations list, messages list, memory list,
 *   action-runs list, conversation detail) go through the existing
 *   `/api/sola/[...path]` catch-all — each query hook then re-validates
 *   the response through the contract adapters so internal payloads
 *   never reach the DOM.
 * - Mutations / confirmations go through dedicated handlers under
 *   `/api/assistant/...` so we control the response adaptation
 *   (e.g. stripping `signal_value`, `signal_metadata`, `preview_payload`,
 *   `request_payload`, `result_payload`, `used_context_summary`).
 *
 * All errors surface as `BackendError` so the standard `<ConflictState>`/
 * `<ErrorState>` + safe `Ref: …` request-id machinery applies.
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

export async function assistantSolaFetch<T>(
  backendPath: `/${string}`,
  init: FetchInit = {},
): Promise<T> {
  return doFetch<T>(`/api/sola${backendPath}`, init);
}

export async function assistantDedicatedFetch<T>(
  url: `/api/assistant${string}`,
  init: FetchInit,
): Promise<T> {
  return doFetch<T>(url, init);
}
