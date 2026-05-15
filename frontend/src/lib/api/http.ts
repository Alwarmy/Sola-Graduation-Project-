import "server-only";

import { getServerEnv } from "@/lib/env/env";
import {
  EXPECTED_SCHEDULE_REVISION_HEADER,
  EXPECTED_VERSION_HEADER,
  REQUEST_ID_HEADER,
} from "@/lib/api/headers";
import { BackendError, parseBackendError } from "@/lib/errors/backend-error";

/**
 * Server-only HTTP foundation for talking to the SOLA backend.
 *
 * CP2 establishes one fetcher used by every server-side caller (route
 * handlers, gateway, runtime handshake). Browser code must NOT import this
 * module — it composes the bearer token from the HttpOnly cookie via the
 * gateway and therefore must run on the server. The `import "server-only"`
 * directive enforces this at build time.
 *
 * Responsibilities:
 *   - Build absolute URLs from `SOLA_BACKEND_URL`.
 *   - Forward an optional bearer token via `Authorization: Bearer <token>`.
 *   - Forward optional `X-Expected-Version` / `X-Expected-Schedule-Revision`
 *     headers for plan/queue/schedule/recovery mutations (PROTO-005/006).
 *   - Capture the backend `x-request-id` header into the result so callers
 *     can put it in developer diagnostics (PROTO-001).
 *   - On non-2xx, parse the response into a typed `BackendError`.
 */

export type BackendRequestInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body. Will be `JSON.stringify`'d and `application/json` set. */
  json?: unknown;
  /** Raw body for non-JSON payloads. */
  body?: BodyInit;
  /** Bearer access token to send (server-only). */
  bearerToken?: string;
  /** Optional `X-Expected-Version` for plan/queue mutations. */
  expectedVersion?: string | number;
  /** Optional `X-Expected-Schedule-Revision` for schedule/recovery mutations. */
  expectedScheduleRevision?: string | number;
  /** Extra headers (rarely needed). Will be merged after standard headers. */
  headers?: Record<string, string>;
  /** Forwarded fetch options. */
  signal?: AbortSignal;
  cache?: RequestCache;
  next?: { revalidate?: number; tags?: string[] };
};

export type BackendResponse<T> = {
  data: T;
  status: number;
  requestId: string | undefined;
};

export async function backendRequest<T = unknown>(
  path: string,
  init: BackendRequestInit = {},
): Promise<BackendResponse<T>> {
  const { SOLA_BACKEND_URL } = getServerEnv();
  const url = buildBackendUrl(SOLA_BACKEND_URL, path);

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (init.bearerToken) {
    headers.authorization = `Bearer ${init.bearerToken}`;
  }
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (init.expectedVersion !== undefined) {
    headers[EXPECTED_VERSION_HEADER] = String(init.expectedVersion);
  }
  if (init.expectedScheduleRevision !== undefined) {
    headers[EXPECTED_SCHEDULE_REVISION_HEADER] = String(init.expectedScheduleRevision);
  }
  if (init.headers) {
    for (const [k, v] of Object.entries(init.headers)) headers[k] = v;
  }

  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;

  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body,
    signal: init.signal,
    cache: init.cache,
    next: init.next,
  });

  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;

  if (!response.ok) {
    throw await parseBackendError(response);
  }

  if (response.status === 204) {
    return { data: undefined as T, status: response.status, requestId };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = (await response.json()) as T;
    return { data, status: response.status, requestId };
  }
  // Unknown content-type — return raw text under the caller's generic type.
  const text = (await response.text()) as unknown as T;
  return { data: text, status: response.status, requestId };
}

function buildBackendUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

export { BackendError };
