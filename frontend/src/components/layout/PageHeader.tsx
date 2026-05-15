import type { HTMLAttributes, ReactNode } from "react";
import styles from "./PageHeader.module.css";

export type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions, className, ...rest }: PageHeaderProps) {
  const composed = [styles.header, className].filter(Boolean).join(" ");
  return (
    <header className={composed} {...rest}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem" }}>
        <h1 className={styles.title}>{title}</h1>
        {actions ? <div>{actions}</div> : null}
      </div>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}

export type SectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  children: ReactNode;
};

export function Section({ title, className, children, ...rest }: SectionProps) {
  const composed = [styles.section, className].filter(Boolean).join(" ");
  return (
    <section className={composed} {...rest}>
      {title ? <h2 className={styles.sectionTitle}>{title}</h2> : null}
      {children}
    </section>
  );
}
