import type { ReactNode } from "react";
import { FALLBACK } from "@/lib/copy/fallback";
import styles from "./State.module.css";

export type ConflictStateProps = {
  title?: string;
  /** Recommended action — typically "Refresh" or "Retry". */
  action?: ReactNode;
};

/**
 * Stale data / optimistic version mismatch panel. CP7/CP8 use this when
 * X-Expected-Version or expected_schedule_revision returns 409/412.
 */
export function ConflictState({ title = FALLBACK.staleRefresh, action }: ConflictStateProps) {
  return (
    <div className={`${styles.panel} ${styles.tonedInfo}`} role="alert">
      <p className={styles.title}>{title}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
