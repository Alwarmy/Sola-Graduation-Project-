import { FALLBACK } from "@/lib/copy/fallback";
import styles from "./State.module.css";

export type LoadingStateProps = {
  title?: string;
  description?: string;
};

/**
 * Honest loading state. The default copy is the locked FALLBACK.loading
 * string; callers may pass a more specific title (e.g. "Loading courses…")
 * but must never use placeholder data.
 */
export function LoadingState({ title = FALLBACK.loading, description }: LoadingStateProps) {
  return (
    <div className={styles.panel} role="status" aria-live="polite">
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
    </div>
  );
}
