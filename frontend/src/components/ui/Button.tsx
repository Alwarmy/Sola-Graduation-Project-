import { forwardRef, type ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true, button shows a busy state and is non-interactive. */
  isBusy?: boolean;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: styles.primary!,
  secondary: styles.secondary!,
  ghost: styles.ghost!,
  danger: styles.danger!,
};

const sizeClass: Record<ButtonSize, string> = {
  sm: styles.sizeSm!,
  md: styles.sizeMd!,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", isBusy = false, className, disabled, type, ...rest },
  ref,
) {
  const composed = [styles.button, variantClass[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={composed}
      disabled={disabled || isBusy}
      aria-busy={isBusy || undefined}
      {...rest}
    />
  );
});
