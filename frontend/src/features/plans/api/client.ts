"use client";

import { BackendError, type BackendErrorDetails } from "@/lib/errors/backend-error";
import {
  REQUEST_ID_HEADER,
  EXPECTED_VERSION_HEADER,
  EXPECTED_SCHEDULE_REVISION_HEADER,
} from "@/lib/api/headers";

/**
 * Browser-only fetchers for the plans feature.
 *
 * - `solaFetch` (re-exported via courses/api) is used for simple authed GETs
 *   (queue list, plans list, active, detail, readiness, items, summary,
 *   recovery preview).
 * - `plansFetch` posts/puts/deletes through the dedicated handlers under
 *   `/api/plans/...` that own concurrency + body shape.
 *
 * The `expectedVersion` option translates to an `x-expected-version`
 * request header that the corresponding handler forwards to the backend.
 * `expectedScheduleRevision` is parallel for CP8 schedule/recovery paths
 * that need a schedule-revision token in addition to (or instead of)
 * the plan version.
 */

export type PlansFetchInit = {
  method: "POST" | "PUT" | "DELETE";
  json?: unknown;
  expectedVersion?: number;
  expectedScheduleRevision?: number;
  signal?: AbortSignal;
};

export async function plansFetch<T>(
  url: `/api/plans${string}`,
  init: PlansFetchInit,
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  if (init.expectedVersion !== undefined) {
    headers[EXPECTED_VERSION_HEADER.toLowerCase()] = String(init.expectedVersion);
  }
  if (init.expectedScheduleRevision !== undefined) {
    headers[EXPECTED_SCHEDULE_REVISION_HEADER.toLowerCase()] = String(
      init.expectedScheduleRevision,
    );
  }
  const response = await fetch(url, {
    method: init.method,
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
