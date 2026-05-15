import type { ReactNode } from "react";

export type FieldErrorMessageProps = {
  children: ReactNode;
  id?: string;
};

/**
 * Lightweight inline error message for single fields. The `FormField`
 * wrapper already renders an error slot, so this exists for cases where
 * a control is used outside `FormField`.
 */
export function FieldErrorMessage({ children, id }: FieldErrorMessageProps) {
  return (
    <span id={id} role="alert" style={{ color: "#b91c1c", fontSize: "0.85rem" }}>
      {children}
    </span>
  );
}
