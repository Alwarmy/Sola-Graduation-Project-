import type { BackendError, FieldError } from "@/lib/errors/backend-error";
import { FALLBACK } from "@/lib/copy/fallback";
import styles from "./State.module.css";

export type ValidationErrorsProps = {
  /** A BackendError known to be a request_validation_error, or its field list. */
  source: BackendError | FieldError[];
  /** Optional override of the panel title. */
  title?: string;
};

/**
 * Form-level summary of field validation errors.
 *
 * Field-level rendering should live on the matching `FormField` via
 * its `error` prop; this component is for the top-of-form summary that
 * lists all problems at once for screen-reader users and pages that
 * cannot easily anchor errors to individual fields.
 */
export function ValidationErrors({ source, title = FALLBACK.validation }: ValidationErrorsProps) {
  const errors = Array.isArray(source) ? source : source.fieldErrors();
  if (errors.length === 0) return null;
  return (
    <div className={`${styles.panel} ${styles.tonedError}`} role="alert">
      <p className={styles.title}>{title}</p>
      <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
        {errors.map((e, i) => (
          <li key={`${e.loc.join(".")}-${i}`} className={styles.description}>
            {humanizeFieldPath(e.loc)}: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function humanizeFieldPath(loc: string[]): string {
  // Strip the leading "body"/"query"/etc. boundary segment if present.
  const trimmed =
    loc.length > 1 && ["body", "query", "path", "header"].includes(loc[0] ?? "") ? loc.slice(1) : loc;
  if (trimmed.length === 0) return "Field";
  return trimmed
    .join(" ")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
}
