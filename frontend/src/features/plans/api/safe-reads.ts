"use client";

import { BackendError, type BackendErrorDetails } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * Browser-only fetcher for the post-CP10-hardening **dedicated safe**
 * plan GET handlers (`/api/plans`, `/api/plans/active`, `/api/plans/queue`,
 * `/api/plans/[planId]`, `/api/plans/[planId]/readiness`).
 *
 * The dedicated handlers run the public-view adapters server-side, so
 * the response body the browser receives is already the safe `Public*`
 * shape — no provider_metadata / quality_signals / user_id / etc.
 * leak. The hook layer therefore doesn't re-parse with Zod; it just
 * forwards typed JSON straight through.
 *
 * Errors are surfaced as `BackendError` so consumers can switch on
 * `error.intent` exactly like every other CP4–CP9 feature query.
 */

type FetchInit = {
  signal?: AbortSignal;
};

export async function plansSafeFetch<T>(
  url: `/api/plans${string}`,
  init: FetchInit = {},
): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
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
