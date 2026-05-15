import type { ReactNode } from "react";
import { FALLBACK } from "@/lib/copy/fallback";
import styles from "./State.module.css";

export type UnavailableStateProps = {
  /** Optional override for the user-facing title. */
  title?: string;
  action?: ReactNode;
};

/**
 * "Source temporarily unavailable" panel. CP6 uses this with the locked
 * Course Search source-unavailable copy (`COURSE_SEARCH_SOURCE_UNAVAILABLE_COPY`).
 */
export function UnavailableState({ title = FALLBACK.unavailable, action }: UnavailableStateProps) {
  return (
    <div className={`${styles.panel} ${styles.tonedWarn}`} role="status">
      <p className={styles.title}>{title}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
