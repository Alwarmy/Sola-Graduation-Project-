import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
};

const toneClass: Record<BadgeTone, string> = {
  neutral: styles.neutral!,
  info: styles.info!,
  success: styles.success!,
  warning: styles.warning!,
  danger: styles.danger!,
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  const composed = [styles.badge, toneClass[tone], className].filter(Boolean).join(" ");
  return (
    <span className={composed} {...rest}>
      {children}
    </span>
  );
}
