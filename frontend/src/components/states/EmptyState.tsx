import type { ReactNode } from "react";
import { FALLBACK } from "@/lib/copy/fallback";
import styles from "./State.module.css";

export type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
};

/**
 * Truthful empty state. Use this when a real backend response returns no
 * items, NOT when data is missing because the request failed. For failure
 * use `ErrorState` or `UnavailableState`.
 */
export function EmptyState({ title = FALLBACK.emptyList, description, action }: EmptyStateProps) {
  return (
    <div className={styles.panel}>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
