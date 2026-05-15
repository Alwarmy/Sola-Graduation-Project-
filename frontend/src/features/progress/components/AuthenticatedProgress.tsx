"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, Section } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";

import { useActivePlan } from "@/features/plans/hooks/usePlans";
import { useExecutionSummary } from "@/features/plans/hooks/useExecutionSummary";
import { useRecoveryPreview } from "@/features/plans/hooks/useRecoveryPreview";
import { useLearnerEvents } from "@/features/progress/hooks/useLearnerEvents";
import { useLearningState } from "@/features/progress/hooks/useLearningState";
import { useRefreshLearningState } from "@/features/progress/hooks/useRefreshLearningState";

import { formatDateTime } from "@/lib/formatters/date";
import type { PublicLearningState } from "@/lib/contracts/learning-state";

export type AuthenticatedProgressProps = {
  user: { id: number; email: string; fullName: string };
};

/**
 * Authenticated `/progress` — composition of CP4-CP10 surfaces with
 * three new CP11 cards (Learning state + Refresh action + Activity).
 *
 * Per-card resilience: each card mounts its own hook and renders an
 * isolated loading/empty/error/protected state. Partial failure on one
 * card does NOT break the rest of the page.
 *
 * H-1 hardened display preserved: when the Progress card shows
 * execution-summary data, counts are the primary surface and the
 * backend `completionRateLabel` is intentionally never rendered.
 */
export function AuthenticatedProgress({ user }: AuthenticatedProgressProps) {
  const activePlan = useActivePlan();
  const activePlanId = activePlan.data?.kind === "loaded" ? activePlan.data.plan.id : null;

  return (
    <main style={{ maxWidth: "64rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <PageHeader
        title="Progress"
        subtitle={`What SOLA has learned about you, and what you've done lately — ${user.fullName || user.email}.`}
        actions={
          <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link href="/">Home</Link>
            <Link href="/plans">Plans</Link>
            <Link href="/assistant">Assistant</Link>
          </span>
        }
      />

      <Section title="Next progress action">
        <NextProgressActionCard activePlanId={activePlanId} />
      </Section>

      <Section title="What SOLA has learned about you">
        <LearningStateCard />
      </Section>

      <Section title="Recent activity">
        <ActivityCard />
      </Section>

      {activePlanId !== null ? (
        <>
          <Section title="Plan progress">
            <PlanProgressCard planId={activePlanId} />
          </Section>
          <Section title="Recovery">
            <RecoveryCard planId={activePlanId} />
          </Section>
        </>
      ) : (
        <Section title="Plan progress">
          <Card>
            <EmptyState
              title="No active plan yet."
              description="Start a plan to track progress here."
              action={<Link href="/plans">Open plans</Link>}
            />
          </Card>
        </Section>
      )}

      <Section title="Assistant">
        <Card>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            Ask the assistant for help interpreting your progress, planning recovery, or
            choosing what to study next.
          </p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            <Link href="/assistant">Open assistant</Link>
          </p>
        </Card>
      </Section>
    </main>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────

function LearningStateCard() {
  const ls = useLearningState();
  const refresh = useRefreshLearningState();

  if (ls.isLoading) return <LoadingState description="Loading your learning state." />;
  if (ls.isError && ls.error) return <ErrorState error={ls.error} />;
  if (!ls.data) return <LoadingState description="Loading your learning state." />;

  if (ls.data.kind === "missing") {
    return (
      <Card>
        <EmptyState
          title="No learning state yet."
          description="Study a few items and use the assistant — SOLA builds your learning state from your activity."
          action={
            <Button
              variant="primary"
              size="sm"
              isBusy={refresh.isPending}
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              {refresh.isPending ? "Refreshing…" : "Refresh learning state"}
            </Button>
          }
        />
      </Card>
    );
  }

  return <LearningStateContent state={ls.data.state} refresh={refresh} />;
}

function LearningStateContent({
  state,
  refresh,
}: {
  state: PublicLearningState;
  refresh: ReturnType<typeof useRefreshLearningState>;
}) {
  return (
    <Card
      title={
        state.currentFocus
          ? `Current focus: ${state.currentFocus}`
          : "Learning state"
      }
      subtitle={`Updated ${formatDateTime(state.updatedAt)}`}
      headerActions={
        <Button
          variant="secondary"
          size="sm"
          isBusy={refresh.isPending}
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {refresh.isPending ? "Refreshing…" : "Refresh"}
        </Button>
      }
    >
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        {state.preferredContentTypeLabel ? (
          <Badge tone="neutral">{state.preferredContentTypeLabel}</Badge>
        ) : null}
        {state.preferredCourseLengthLabel ? (
          <Badge tone="neutral">{state.preferredCourseLengthLabel}</Badge>
        ) : null}
        {state.preferredLanguageLabel ? (
          <Badge tone="neutral">{state.preferredLanguageLabel}</Badge>
        ) : null}
        <Badge tone="info">Engagement {state.engagementScore}</Badge>
      </div>
      {state.dominantInterests.length > 0 ? (
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          <strong>Strongest interests:</strong> {state.dominantInterests.join(", ")}
        </p>
      ) : null}
      {state.emergingInterests.length > 0 ? (
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
          <strong>Emerging:</strong> {state.emergingInterests.join(", ")}
        </p>
      ) : null}
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#555" }}>
        {state.coveredTopicsCount} topic{state.coveredTopicsCount === 1 ? "" : "s"} covered so far.
      </p>
      {state.coveredTopicsPreview.length > 0 ? (
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#555" }}>
          Recent: {state.coveredTopicsPreview.slice(0, 5).join(", ")}
          {state.coveredTopicsCount > 5 ? "…" : ""}
        </p>
      ) : null}
      {refresh.error ? (
        <div style={{ marginTop: "0.5rem" }}>
          <ErrorState error={refresh.error} />
        </div>
      ) : null}
    </Card>
  );
}

function ActivityCard() {
  const events = useLearnerEvents({ limit: 10 });
  if (events.isLoading) return <LoadingState description="Loading recent activity." />;
  if (events.isError && events.error) return <ErrorState error={events.error} />;
  if (!events.data) return <LoadingState description="Loading recent activity." />;
  if (events.data.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No recent activity yet."
          description="Open courses, plan items, or chat with the assistant — your activity will appear here."
        />
      </Card>
    );
  }
  // Sort newest-first defensively.
  const sorted = events.data
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return (
    <Card>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: "0.4rem",
        }}
      >
        {sorted.map((e) => (
          <li
            key={e.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "0.5rem",
            }}
          >
            <span style={{ fontSize: "0.9rem" }}>
              <Badge tone={e.isKnownEventType ? "info" : "neutral"}>{e.eventTypeLabel}</Badge>
            </span>
            <span style={{ fontSize: "0.75rem", color: "#888" }}>
              {formatDateTime(e.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Plan progress card — counts-first per the H-1 hardening rule. We do
 * NOT render the backend `completionRateLabel` (would surface
 * misleading "99%"/"100%" while `NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001`
 * is open). The frontend does not recompute either.
 */
function PlanProgressCard({ planId }: { planId: number }) {
  const summary = useExecutionSummary(planId);
  if (summary.isLoading) return <LoadingState description="Loading plan progress." />;
  if (summary.isError && summary.error) return <ErrorState error={summary.error} />;
  if (!summary.data) return <LoadingState description="Loading plan progress." />;
  const s = summary.data;
  if (s.totalItems === 0) {
    return (
      <Card>
        <EmptyState
          title="No progress data yet."
          description="Generate the schedule on the plan to see progress here."
          action={<Link href={`/plans/${planId}`}>Open plan</Link>}
        />
      </Card>
    );
  }
  return (
    <Card>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: "0.35rem",
        }}
      >
        <Row label="Total" value={s.totalItems} />
        <Row label="Completed" value={s.completedItemsCount} tone="success" />
        <Row label="In progress" value={s.inProgressItemsCount} tone="info" />
        <Row label="Pending" value={s.pendingItemsCount} />
        <Row label="Skipped" value={s.skippedItemsCount} tone="warning" />
        <Row label="Due today" value={s.dueTodayItemsCount} tone="info" />
        <Row label="Overdue" value={s.overdueItemsCount} tone="danger" />
      </ul>
      {/* H-1 hardened display — backend completionRateLabel intentionally
          NOT rendered while NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001 is
          open. Counts above are the reliable view. */}
      <p
        style={{
          margin: "0.5rem 0 0",
          fontSize: "0.75rem",
          color: "#888",
        }}
        data-testid="progress-h1-safe-note"
      >
        Progress percentage is under review. Counts above are the reliable view.
      </p>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href={`/plans/${planId}`}>Open plan</Link>
      </p>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "info" | "warning" | "danger";
}) {
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <span style={{ color: "#555", fontSize: "0.875rem" }}>{label}</span>
      <Badge tone={tone ?? "neutral"}>{value}</Badge>
    </li>
  );
}

function RecoveryCard({ planId }: { planId: number }) {
  const preview = useRecoveryPreview(planId);
  if (preview.isLoading) return <LoadingState description="Loading recovery preview." />;
  if (preview.isError && preview.error) return <ErrorState error={preview.error} />;
  if (!preview.data) return <LoadingState description="Loading recovery preview." />;
  const p = preview.data;
  if (!p.needsRecovery) {
    return (
      <Card headerActions={<Badge tone="success">{p.driftLevelLabel}</Badge>}>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>You&apos;re on track right now.</p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href={`/plans/${planId}`}>Open plan</Link>
        </p>
      </Card>
    );
  }
  return (
    <Card headerActions={<Badge tone="warning">{p.driftLevelLabel}</Badge>}>
      <p style={{ margin: 0, fontSize: "0.9rem" }}>
        Overdue {p.overdueItemsCount} item{p.overdueItemsCount === 1 ? "" : "s"} ·
        pressure {p.recoveryPressureLabel}.
      </p>
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#444" }}>
        Recommended: <strong>{p.recommendedActionLabel}</strong>
        {p.recommendedRecoveryModeLabel ? ` · ${p.recommendedRecoveryModeLabel}` : ""}
      </p>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href={`/plans/${planId}`}>Review recovery on plan detail</Link>
      </p>
    </Card>
  );
}

/**
 * Deterministic next-action priority for the Progress page:
 *   1. no active plan → discover/create plan.
 *   2. active plan but no learning state yet → refresh learning state
 *      (the only mutation we own on this page).
 *   3. active plan + recovery needed → review recovery on plan detail.
 *   4. otherwise → continue plan on plan detail.
 */
function NextProgressActionCard({ activePlanId }: { activePlanId: number | null }) {
  const ls = useLearningState();
  const recovery = useRecoveryPreview(activePlanId ?? 0, { enabled: activePlanId !== null });

  if (activePlanId === null) {
    return (
      <Card headerActions={<Badge tone="info">Start here</Badge>}>
        <p style={{ margin: 0, fontWeight: 500 }}>Start a plan to begin tracking progress.</p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href="/plans">Open plans</Link>
          {" · "}
          <Link href="/courses">Discover courses</Link>
        </p>
      </Card>
    );
  }
  if (ls.data?.kind === "missing") {
    return (
      <Card headerActions={<Badge tone="info">Refresh</Badge>}>
        <p style={{ margin: 0, fontWeight: 500 }}>
          Build your learning state from recent activity.
        </p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#555" }}>
          Use the Refresh button on the learning-state card below.
        </p>
      </Card>
    );
  }
  if (recovery.data?.needsRecovery) {
    return (
      <Card headerActions={<Badge tone="warning">Recovery</Badge>}>
        <p style={{ margin: 0, fontWeight: 500 }}>You may be falling behind.</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#555" }}>
          Review recovery options on plan detail.
        </p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href={`/plans/${activePlanId}`}>Open plan</Link>
        </p>
      </Card>
    );
  }
  return (
    <Card headerActions={<Badge tone="success">On track</Badge>}>
      <p style={{ margin: 0, fontWeight: 500 }}>Keep moving on your active plan.</p>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href={`/plans/${activePlanId}`}>Open plan</Link>
      </p>
    </Card>
  );
}
