import "server-only";

import { getServerEnv } from "@/lib/env/env";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import type { RuntimeReport, ProbeOutcome } from "@/lib/runtime/runtime-report";

/**
 * Lightweight runtime handshake against the SOLA backend.
 *
 * Resolves the CP1 deviation: the plan §17 expected a foundation utility
 * under `src/lib/runtime/` but CP1 captured evidence in `docs/runtime/`
 * instead. CP2 now provides the utility so later checkpoints can probe
 * the backend programmatically (for example: a developer-only diagnostics
 * panel or a CI/CD readiness gate).
 *
 * Behavior:
 *   - Probes `GET /`, `GET /health/db`, and `GET /openapi.json`.
 *   - Captures `x-request-id` from every response (success or failure).
 *   - For OpenAPI, parses the doc to expose `title`, `version`, and
 *     `operationCount`. The locked count is 53 — drift is a signal, not
 *     an error this utility raises.
 *   - Never throws. Network and parsing failures are returned as
 *     `ProbeOutcome.kind === "error"`.
 *
 * This utility is server-only because it reads `SOLA_BACKEND_URL` from the
 * server-side env and is intended for diagnostics, not learner UI.
 */
export async function backendHandshake(options?: {
  signal?: AbortSignal;
}): Promise<RuntimeReport> {
  const { SOLA_BACKEND_URL } = getServerEnv();
  const base = SOLA_BACKEND_URL.replace(/\/+$/, "");
  const generatedAt = new Date().toISOString();

  const [rootProbe, healthDbProbe, openapi] = await Promise.all([
    probeJson(`${base}/`, options?.signal),
    probeJson(`${base}/health/db`, options?.signal),
    probeOpenapi(`${base}/openapi.json`, options?.signal),
  ]);

  return {
    generatedAt,
    backendUrl: base,
    rootProbe,
    healthDbProbe,
    openapiProbe: openapi,
  };
}

async function probeJson(url: string, signal?: AbortSignal): Promise<ProbeOutcome> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
      cache: "no-store",
    });
    const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
    if (!response.ok) {
      return { kind: "error", status: response.status, message: response.statusText, requestId };
    }
    const body = (await response.json().catch(() => undefined)) as unknown;
    const summary = body && typeof body === "object" ? safeSummary(body) : undefined;
    return { kind: "ok", status: response.status, requestId, summary };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "unknown error" };
  }
}

async function probeOpenapi(
  url: string,
  signal?: AbortSignal,
): Promise<RuntimeReport["openapiProbe"]> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal,
      cache: "no-store",
    });
    const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
    if (!response.ok) {
      return { kind: "error", status: response.status, message: response.statusText, requestId };
    }
    const doc = (await response.json()) as Record<string, unknown>;
    const info = (doc.info as Record<string, unknown> | undefined) ?? {};
    const paths = (doc.paths as Record<string, Record<string, unknown>> | undefined) ?? {};
    let operationCount = 0;
    for (const ops of Object.values(paths)) {
      for (const method of Object.keys(ops)) {
        if (["get", "post", "put", "patch", "delete"].includes(method)) operationCount++;
      }
    }
    return {
      kind: "ok",
      status: response.status,
      requestId,
      title: typeof info.title === "string" ? info.title : undefined,
      version: typeof info.version === "string" ? info.version : undefined,
      operationCount,
    };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "unknown error" };
  }
}

function safeSummary(body: object): string | undefined {
  // Render only a one-line readable summary for diagnostics. Never expose
  // raw backend internals to a learner UI; this is for developer panels.
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  const [k, v] = entries[0]!;
  const valueStr =
    typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "…";
  return `${k}: ${valueStr}`;
}
