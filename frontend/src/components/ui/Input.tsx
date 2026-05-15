import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import styles from "./Input.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** When true, the field is rendered with an error border for screen readers. */
  isInvalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { isInvalid = false, className, ...rest },
  ref,
) {
  const composed = [styles.input, className].filter(Boolean).join(" ");
  return <input ref={ref} className={composed} aria-invalid={isInvalid || undefined} {...rest} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  isInvalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { isInvalid = false, className, ...rest },
  ref,
) {
  const composed = [styles.textarea, className].filter(Boolean).join(" ");
  return (
    <textarea ref={ref} className={composed} aria-invalid={isInvalid || undefined} {...rest} />
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  isInvalid?: boolean;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { isInvalid = false, className, ...rest },
  ref,
) {
  const composed = [styles.select, className].filter(Boolean).join(" ");
  return (
    <select ref={ref} className={composed} aria-invalid={isInvalid || undefined} {...rest} />
  );
});
