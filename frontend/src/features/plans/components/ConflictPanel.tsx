"use client";

import { Button } from "@/components/ui/Button";
import { ConflictState } from "@/components/states/ConflictState";
import { BackendError } from "@/lib/errors/backend-error";
import { formatRequestId } from "@/lib/formatters/request-id";

export type ConflictPanelProps = {
  error: unknown;
  onRefresh: () => void;
};

/**
 * Render a CP3 `<ConflictState>` only when the error is a backend
 * stale/version mismatch (`BackendError.intent === "stale-refresh"`, OR
 * status 409/412). Other errors should be handled by the caller's
 * `<ErrorState>` block.
 *
 * Pre-CP8 hardening D-9: also surface the request-id (safe diagnostic
 * only) so users + support can correlate a stale-write 412 with the
 * exact backend log line.
 */
export function ConflictPanel({ error, onRefresh }: ConflictPanelProps) {
  if (!(error instanceof BackendError)) return null;
  const isConflict =
    error.intent === "stale-refresh" || error.status === 409 || error.status === 412;
  if (!isConflict) return null;
  const ref = formatRequestId(error.requestId ?? null);
  return (
    <ConflictState
      action={
        <span style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <Button variant="primary" size="sm" onClick={onRefresh}>
            Refresh and try again
          </Button>
          {ref ? (
            <span
              style={{ fontSize: "0.75rem", color: "#555" }}
              title={error.requestId}
              data-testid="conflict-request-id"
            >
              {ref}
            </span>
          ) : null}
        </span>
      }
    />
  );
}
