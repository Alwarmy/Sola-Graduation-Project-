/**
 * Known backend error codes and the UX intent the frontend should apply.
 *
 * CP1 runtime probes observed these `error_code` values directly:
 *   - `request_validation_error` (422 from request-body validation)
 *   - `invalid_credentials`      (401 from POST /auth/login)
 *
 * The remaining entries are derived from backend reference v3.1 §4 and the
 * AppException class index. They are documented here so CP3 can map each to
 * concrete user-facing copy and behavior without re-deriving them from the
 * backend symbol index every time.
 *
 * IMPORTANT:
 *   - This map is intentionally not exhaustive. Open question #2 in
 *     docs/runtime/B1_CP1_backend_runtime_snapshot.md tracks enumerating
 *     every AppException subclass; CP2 wires the foundation, CP3+ wires the
 *     final copy.
 *   - Frontend must NEVER render the `error_code` string itself to learners.
 *     Use it only to pick UX intent + Arabic/English copy in CP3.
 */

export type BackendErrorIntent =
  /** User must (re-)authenticate. Clear session, route to /login. */
  | "login"
  /** Transient — let the user retry the same action. */
  | "retry"
  /** Server state moved; refetch the query that produced this error. */
  | "refetch"
  /** Optimistic version mismatch — refetch and re-apply. */
  | "stale-refresh"
  /** Resource not found — show empty/not-found state instead of error. */
  | "not-found"
  /** Backend or its dependency unavailable — show source-unavailable copy. */
  | "unavailable"
  /** Validation failed at the request level — surface field-level errors. */
  | "validation"
  /** Rate limited — show retry-later guidance, lock duplicate submit. */
  | "rate-limited"
  /** Unknown — log + show safe generic error. */
  | "unknown";

/**
 * Mapping from backend `error_code` to UX intent. Extend as new codes are
 * observed at runtime; never invent codes that the backend does not emit.
 */
export const BACKEND_ERROR_INTENT: Readonly<Record<string, BackendErrorIntent>> = {
  // observed at runtime in CP1
  request_validation_error: "validation",
  invalid_credentials: "login",

  // observed at runtime in CP5 (backend enforces enum/business validation
  // separately from request-shape validation; 400 with this code).
  validation_error: "validation",

  // derived from backend reference + AppException class names
  auth_rate_limited: "rate-limited",
  rate_limited: "rate-limited",
  not_authenticated: "login",
  forbidden: "login",
  not_found: "not-found",
  conflict: "stale-refresh",
  precondition_failed: "stale-refresh",
  expected_version_mismatch: "stale-refresh",
  expected_schedule_revision_mismatch: "stale-refresh",
  source_unavailable: "unavailable",
  upstream_unavailable: "unavailable",
};

export function intentForErrorCode(code: string | undefined): BackendErrorIntent {
  if (!code) return "unknown";
  return BACKEND_ERROR_INTENT[code] ?? "unknown";
}
