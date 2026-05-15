import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import { intentForErrorCode, type BackendErrorIntent } from "@/lib/errors/error-codes";

/**
 * A normalized backend error. Wraps both error envelopes observed during
 * CP1 runtime probing:
 *
 *   - FastAPI default 401:
 *       `{ "detail": "Not authenticated" }` (+ `www-authenticate: Bearer`)
 *   - Custom AppException envelope:
 *       `{ detail, error_code, request_id, details? }`
 *   - Request validation 422 is the AppException envelope with
 *     `error_code: "request_validation_error"` and
 *     `details.errors: [{ type, loc, msg, ... }]`.
 *
 * `requestId` is the most useful diagnostic the frontend can keep. It is
 * captured from the `x-request-id` response header (always present) and
 * cross-checked with `request_id` in the body when available.
 *
 * NEVER render `BackendError.detail`, `errorCode`, or `requestId` directly
 * to learners. CP3 owns the user-safe label/copy layer.
 */
export class BackendError extends Error {
  readonly status: number;
  /** Raw backend `detail` string. Internal diagnostic only. */
  readonly detail: string;
  /** Backend `error_code` if the response uses the custom envelope. */
  readonly errorCode?: string;
  /** Backend request id from headers (preferred) or body. */
  readonly requestId?: string;
  /** Optional structured details, present on validation errors. */
  readonly details?: BackendErrorDetails;
  /** UX intent derived from `errorCode`; see `BackendErrorIntent`. */
  readonly intent: BackendErrorIntent;

  constructor(init: {
    status: number;
    detail: string;
    errorCode?: string;
    requestId?: string;
    details?: BackendErrorDetails;
  }) {
    super(`backend ${init.status} ${init.errorCode ?? "error"}: ${init.detail}`);
    this.name = "BackendError";
    this.status = init.status;
    this.detail = init.detail;
    this.errorCode = init.errorCode;
    this.requestId = init.requestId;
    this.details = init.details;
    this.intent = init.errorCode ? intentForErrorCode(init.errorCode) : statusToIntent(init.status);
  }

  /** Field-level errors when this is a 422 validation error, else `[]`. */
  fieldErrors(): FieldError[] {
    if (this.errorCode !== "request_validation_error") return [];
    const errors = this.details?.errors;
    if (!Array.isArray(errors)) return [];
    return errors
      .map((raw): FieldError | null => {
        if (!raw || typeof raw !== "object") return null;
        const e = raw as Record<string, unknown>;
        const loc = Array.isArray(e.loc) ? (e.loc as unknown[]).map(String) : [];
        const msg = typeof e.msg === "string" ? e.msg : "Invalid value";
        const type = typeof e.type === "string" ? e.type : undefined;
        return { loc, message: msg, type };
      })
      .filter((x): x is FieldError => x !== null);
  }
}

export type FieldError = {
  /** Pydantic `loc` tuple, e.g. `["body", "email"]`. */
  loc: string[];
  /** Raw backend message; CP3's copy layer maps to user-safe text. */
  message: string;
  /** Pydantic error type, e.g. `missing`, `value_error`. */
  type?: string;
};

export type BackendErrorDetails = {
  errors?: unknown[];
  [key: string]: unknown;
};

/**
 * Parse a non-OK `Response` into a `BackendError`. Reads JSON when the
 * content-type allows; otherwise builds a minimal error from status + headers.
 * The caller is responsible for short-circuiting on `response.ok`.
 */
export async function parseBackendError(response: Response): Promise<BackendError> {
  const headerRequestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;
  const status = response.status;

  let body: unknown = undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
  }

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const detail = typeof obj.detail === "string" ? obj.detail : defaultDetailForStatus(status);
    const errorCode = typeof obj.error_code === "string" ? obj.error_code : undefined;
    const bodyRequestId = typeof obj.request_id === "string" ? obj.request_id : undefined;
    const details =
      obj.details && typeof obj.details === "object"
        ? (obj.details as BackendErrorDetails)
        : undefined;
    return new BackendError({
      status,
      detail,
      errorCode,
      requestId: bodyRequestId ?? headerRequestId,
      details,
    });
  }

  return new BackendError({
    status,
    detail: defaultDetailForStatus(status),
    requestId: headerRequestId,
  });
}

function defaultDetailForStatus(status: number): string {
  if (status === 401) return "Not authenticated";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not found";
  if (status === 409) return "Conflict";
  if (status === 412) return "Precondition failed";
  if (status === 422) return "Request validation failed";
  if (status === 429) return "Rate limited";
  if (status >= 500) return "Backend unavailable";
  return "Backend error";
}

function statusToIntent(status: number): BackendErrorIntent {
  if (status === 401 || status === 403) return "login";
  if (status === 404) return "not-found";
  if (status === 409 || status === 412) return "stale-refresh";
  if (status === 422) return "validation";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "unavailable";
  return "unknown";
}
