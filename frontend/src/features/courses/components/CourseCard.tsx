import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatOptional } from "@/lib/formatters/optional";
import type { PublicCourseCard } from "@/lib/contracts/courses";
import styles from "./CourseCard.module.css";

export type CourseCardProps = {
  course: PublicCourseCard;
  /** Optional sub-text below the card title (recommendation explanation). */
  explanationSummary?: string | null;
  /** If true, hide the link to the detail page (useful when card is already on detail). */
  hideDetailLink?: boolean;
  /** Optional CP7 action slot — e.g. `<AddToQueueButton>`. */
  actionSlot?: ReactNode;
};

const TONE_MAP: Record<string, BadgeTone> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
};

/**
 * Curated course card. Renders only safe backend-built labels: title,
 * provider, content format, difficulty, duration, pricing, topic tags,
 * progression, quality tier, and `card_summary`. Provider metadata, quality
 * signals, discovery, raw IDs, ingestion counters etc. are never rendered.
 */
export function CourseCard({
  course,
  explanationSummary,
  hideDetailLink,
  actionSlot,
}: CourseCardProps) {
  const detailHref = `/courses/${course.id}` as const;
  return (
    <Card>
      <div className={styles.card}>
        <h3 className={styles.title}>
          {hideDetailLink ? (
            course.title
          ) : (
            <Link href={detailHref} className={styles.titleLink}>
              {course.title}
            </Link>
          )}
        </h3>
        {course.cardSummary ? <p className={styles.summary}>{course.cardSummary}</p> : null}
        {explanationSummary ? <p className={styles.explanation}>{explanationSummary}</p> : null}
        {course.badges.length > 0 ? (
          <div className={styles.metaRow}>
            {course.badges.map((b) => (
              <Badge key={b.key} tone={TONE_MAP[b.tone ?? "neutral"] ?? "neutral"}>
                {b.label}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className={styles.detailRow}>
          <span>{formatOptional(course.instructorDisplayName)}</span>
          {course.providerDisplayName ? <span> · {course.providerDisplayName}</span> : null}
        </p>
        {actionSlot ? <div style={{ marginTop: "0.25rem" }}>{actionSlot}</div> : null}
      </div>
    </Card>
  );
}
