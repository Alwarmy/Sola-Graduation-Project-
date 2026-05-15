import { useId, type ReactNode } from "react";
import styles from "./FormField.module.css";

export type FormFieldProps = {
  label: ReactNode;
  htmlFor?: string;
  /** Optional supporting hint shown below the label. */
  hint?: ReactNode;
  /** Per-field error message. When set, the field is rendered invalid. */
  error?: ReactNode;
  /** Marks the field with a small required indicator (visual only). */
  required?: boolean;
  /** Renders a single form control. */
  children: (api: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
};

/**
 * A form-field wrapper that connects label, control, hint, and error.
 *
 * Usage:
 *   <FormField label="Email" error={errors.email}>
 *     {(api) => <Input type="email" {...api} />}
 *   </FormField>
 *
 * The wrapper supplies an `id`, `aria-invalid`, and `aria-describedby`
 * automatically so callers don't have to wire accessibility plumbing every
 * time. Field-level error rendering is the only place a raw backend
 * validation message reaches the DOM; CP6+ form code can map the backend
 * `loc` array to the correct field via `BackendError.fieldErrors()`.
 */
export function FormField({ label, htmlFor, hint, error, required, children }: FormFieldProps) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const api = {
    id,
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? <span className={styles.required} aria-hidden="true">*</span> : null}
      </label>
      {children(api)}
      {hint && !error ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
