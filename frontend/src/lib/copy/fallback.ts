/**
 * Locked user-facing fallback copy for missing/empty/error states.
 *
 * Kept as a single source so:
 *   - Block 2 can translate without grepping component files.
 *   - The raw-value guard can assert against accidental leakage of the
 *     placeholder strings (e.g. "null", "undefined") into rendered UI.
 *
 * NEVER render backend `error_code`, request ids, or internal terms here.
 */

export const FALLBACK = {
  /** Value is missing — used by `formatOptional` and friends. */
  unknown: "Not available",
  /** A list is empty — generic safe default. */
  emptyList: "Nothing here yet.",
  /** A page/section is loading. */
  loading: "Loading…",
  /** Something went wrong but it is safe to retry. */
  retryable: "Something went wrong. Please try again.",
  /** Auth/session required to continue. */
  signInRequired: "Please sign in to continue.",
  /** Permissions don't allow the action. */
  forbidden: "You don't have access to this.",
  /** Resource doesn't exist. */
  notFound: "We couldn't find what you were looking for.",
  /** The remote service is down / unavailable. */
  unavailable: "This is temporarily unavailable. Please try again later.",
  /** Optimistic version mismatch / stale data. */
  staleRefresh: "This has changed since you opened it. Refresh and try again.",
  /** Auth rate limiting. */
  rateLimited: "Too many attempts. Please wait a moment and try again.",
  /** Request validation failure (form-level summary). */
  validation: "Please review the highlighted fields.",
} as const;

export type FallbackKey = keyof typeof FALLBACK;
