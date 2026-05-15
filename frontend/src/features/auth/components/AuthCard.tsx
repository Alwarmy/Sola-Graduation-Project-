import type { ReactNode } from "react";
import styles from "./AuthCard.module.css";

export type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Layout shell shared by login and register pages. Pure presentation, no
 * auth knowledge — keeps the form components small and testable.
 */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      {children}
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </main>
  );
}
