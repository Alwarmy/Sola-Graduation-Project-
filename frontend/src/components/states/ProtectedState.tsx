import type { ReactNode } from "react";
import { FALLBACK } from "@/lib/copy/fallback";
import styles from "./State.module.css";

export type ProtectedStateProps = {
  title?: string;
  action?: ReactNode;
};

/**
 * Shown when a page or section requires authentication and the user is
 * not signed in. Concrete CP4 routes will pass a "Sign in" action button.
 */
export function ProtectedState({ title = FALLBACK.signInRequired, action }: ProtectedStateProps) {
  return (
    <div className={`${styles.panel} ${styles.tonedInfo}`}>
      <p className={styles.title}>{title}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
