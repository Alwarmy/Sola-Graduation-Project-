import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export type CardProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  /**
   * `ReactNode` so callers can pass strings, badges, or links. We `Omit`
   * the DOM `title` attribute (which would otherwise be `string`) from the
   * intersection so `<Card title={<Link>…</Link>}>` typechecks.
   */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned content in the header row (e.g. badge, action). */
  headerActions?: ReactNode;
  children?: ReactNode;
};

export function Card({
  title,
  subtitle,
  headerActions,
  className,
  children,
  ...rest
}: CardProps) {
  const composed = [styles.card, className].filter(Boolean).join(" ");
  return (
    <div className={composed} {...rest}>
      {(title || subtitle || headerActions) && (
        <header className={styles.cardHeader}>
          <div>
            {title ? <h3 className={styles.cardTitle}>{title}</h3> : null}
            {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
          </div>
          {headerActions ? <div>{headerActions}</div> : null}
        </header>
      )}
      {children ? <div className={styles.cardBody}>{children}</div> : null}
    </div>
  );
}
