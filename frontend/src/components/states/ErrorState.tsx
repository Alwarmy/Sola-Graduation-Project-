import type { ReactNode } from "react";
import { BackendError } from "@/lib/errors/backend-error";
import type { BackendErrorIntent } from "@/lib/errors/error-codes";
import { FALLBACK } from "@/lib/copy/fallback";
import { formatRequestId } from "@/lib/formatters/request-id";
import styles from "./State.module.css";

const INTENT_TITLE: Record<BackendErrorIntent, string> = {
  login: FALLBACK.signInRequired,
  retry: FALLBACK.retryable,
  refetch: FALLBACK.retryable,
  "stale-refresh": FALLBACK.staleRefresh,
  "not-found": FALLBACK.notFound,
  unavailable: FALLBACK.unavailable,
  validation: FALLBACK.validation,
  "rate-limited": FALLBACK.rateLimited,
  unknown: FALLBACK.retryable,
};

export type ErrorStateProps = {
  /** Backend or generic error to render. */
  error: BackendError | Error | unknown;
  /** Optional override for the user-facing title. */
  title?: string;
  /** Optional retry button or other action. */
  action?: ReactNode;
};

/**
 * Safe error renderer.
 *
 * - For `BackendError`, selects a user-safe title from the locked
 *   FALLBACK copy via the error's `intent`. Preserves `requestId` as a
 *   small "Ref: …" line for support.
 * - For any other error, falls back to FALLBACK.retryable; never renders
 *   the raw `.message` (which may contain backend internal wording).
 *
 * The component itself never displays `error_code`, `detail`, or stack
 * traces.
 */
export function ErrorState({ error, title, action }: ErrorStateProps) {
  const isBackend = error instanceof BackendError;
  const intent: BackendErrorIntent = isBackend ? error.intent : "unknown";
  const requestId = isBackend ? error.requestId : undefined;
  const resolvedTitle = title ?? INTENT_TITLE[intent];
  const ref = formatRequestId(requestId ?? null);
  const toneClass =
    intent === "unavailable" || intent === "rate-limited"
      ? styles.tonedWarn
      : intent === "stale-refresh"
        ? styles.tonedInfo
        : styles.tonedError;
  const composed = [styles.panel, toneClass].filter(Boolean).join(" ");

  return (
    <div className={composed} role="alert" aria-live="assertive">
      <p className={styles.title}>{resolvedTitle}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
      {ref ? (
        <p className={styles.requestId} title={requestId}>
          {ref}
        </p>
      ) : null}
    </div>
  );
}
