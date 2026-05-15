"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader, Section } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";

import { useProfile } from "@/features/profile/hooks/useProfile";
import { useActivePlan, usePlans } from "@/features/plans/hooks/usePlans";
import { usePlanQueue } from "@/features/plans/hooks/usePlanQueue";
import { usePlanReadiness } from "@/features/plans/hooks/usePlanReadiness";
import { useExecutionSummary } from "@/features/plans/hooks/useExecutionSummary";
import { useRecoveryPreview } from "@/features/plans/hooks/useRecoveryPreview";
import { usePlanItems } from "@/features/plans/hooks/usePlanItems";
import { useAssistantConversations } from "@/features/assistant/hooks/useAssistantConversations";

import type { PublicProfile } from "@/lib/contracts/profile";
import type { PublicLearningPlan } from "@/lib/contracts/plans";
import {
  trackLabel,
  goalLabel,
  preferredLanguageLabel,
} from "@/lib/labels/profile-options";

export type AuthenticatedHomeProps = {
  user: { id: number; email: string; fullName: string };
};

/**
 * Authenticated learner Home. Composition of CP4–CP9 surfaces, with each
 * card mounting its own hook and rendering an isolated
 * loading/empty/error/protected state. Partial failure on one card does
 * not break the rest of Home (directive §22.D).
 *
 * H-1 handling (NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001):
 *   - The execution-summary card surfaces counts (completed / in
 *     progress / pending / skipped / due today / overdue) as the primary
 *     content.
 *   - `completionRateLabel` is shown only as a small secondary line with
 *     a "(backend rate)" annotation so a misleading "99%" cannot be
 *     mistaken for a headline success metric.
 *   - The frontend does NOT recompute the rate; it surfaces whatever the
 *     backend returned, just without headline emphasis.
 */
export function AuthenticatedHome({ user }: AuthenticatedHomeProps) {
  const profile = useProfile();
  const activePlan = useActivePlan();
  const planList = usePlans();
  const queue = usePlanQueue();

  const activePlanId =
    activePlan.data?.kind === "loaded" ? activePlan.data.plan.id : null;
  const activePlanObj =
    activePlan.data?.kind === "loaded" ? activePlan.data.plan : null;

  const conversations = useAssistantConversations();

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName || user.email}.`}
        subtitle="Your learning home."
        actions={
          <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link href="/courses">Discover</Link>
            <Link href="/plans">Plans</Link>
            <Link href="/assistant">Assistant</Link>
            <Link href="/profile">Profile</Link>
          </span>
        }
      />

      <Section title="Next step">
        <NextActionCard
          profile={profile}
          activePlan={activePlan}
          queue={queue}
          activePlanId={activePlanId}
        />
      </Section>

      <Section title="Profile">
        <ProfileCard profile={profile} />
      </Section>

      <Section title="Active plan">
        <ActivePlanCard activePlan={activePlan} planList={planList} />
      </Section>

      <Section title="Queue">
        <QueueCard queue={queue} />
      </Section>

      {activePlanId !== null && activePlanObj !== null ? (
        <>
          <Section title="Schedule readiness">
            <ReadinessCard planId={activePlanId} />
          </Section>
          <Section title="Next scheduled item">
            <NextItemCard planId={activePlanId} />
          </Section>
          <Section title="Progress">
            <ExecutionCountsCard planId={activePlanId} />
          </Section>
          <Section title="Recovery">
            <RecoveryCard planId={activePlanId} planRef={activePlanObj} />
          </Section>
        </>
      ) : null}

      <Section title="Assistant">
        <AssistantCard conversations={conversations} />
      </Section>
    </>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────

function ProfileCard({ profile }: { profile: ReturnType<typeof useProfile> }) {
  if (profile.isLoading) return <LoadingState description="Loading your profile." />;
  if (profile.isError && profile.error) return <ErrorState error={profile.error} />;
  if (!profile.data) return <LoadingState description="Loading your profile." />;
  if (profile.data.kind === "missing") {
    return (
      <Card>
        <EmptyState
          title="Tell us about you."
          description="Create a quick profile so the assistant and plans can guide you."
          action={<Link href="/profile">Open profile</Link>}
        />
      </Card>
    );
  }
  return <ProfileSummaryRow profile={profile.data.profile} />;
}

function ProfileSummaryRow({ profile }: { profile: PublicProfile }) {
  return (
    <Card>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <Badge tone="success">Profile ready</Badge>
        <Badge tone="neutral">{trackLabel(profile.backgroundTrack)}</Badge>
        <Badge tone="neutral">{goalLabel(profile.goal)}</Badge>
        <Badge tone="neutral">{preferredLanguageLabel(profile.preferredLanguage)}</Badge>
      </div>
      <p style={{ margin: 0, fontSize: "0.875rem", color: "#555" }}>
        {profile.weeklyHours} hours per week · {profile.timezone}
      </p>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href="/profile">Edit profile</Link>
      </p>
    </Card>
  );
}

function ActivePlanCard({
  activePlan,
  planList,
}: {
  activePlan: ReturnType<typeof useActivePlan>;
  planList: ReturnType<typeof usePlans>;
}) {
  if (activePlan.isLoading) return <LoadingState description="Loading your active plan." />;
  if (activePlan.isError && activePlan.error)
    return <ErrorState error={activePlan.error} />;
  if (!activePlan.data) return <LoadingState description="Loading your active plan." />;

  if (activePlan.data.kind === "missing") {
    const totalPlans =
      !planList.isError && planList.data ? planList.data.length : null;
    return (
      <Card>
        <EmptyState
          title="No active plan yet."
          description={
            totalPlans !== null && totalPlans > 0
              ? "Open Plans to activate or create one."
              : "Add courses to your queue, then create your first plan."
          }
          action={
            <span style={{ display: "flex", gap: "0.5rem" }}>
              <Link href="/plans">Open plans</Link>
              <Link href="/courses">Discover courses</Link>
            </span>
          }
        />
      </Card>
    );
  }

  const plan = activePlan.data.plan;
  return (
    <Card
      title={plan.title}
      subtitle={plan.goal}
      headerActions={<Badge tone="success">{plan.statusLabel}</Badge>}
    >
      <p style={{ margin: 0, fontSize: "0.875rem", color: "#555" }}>
        {plan.courses.length} course{plan.courses.length === 1 ? "" : "s"} ·
        weekly target {plan.weeklyHoursSnapshot}h · timezone{" "}
        {plan.scheduleTimezoneSnapshot}
      </p>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href={`/plans/${plan.id}`}>Open plan</Link>
      </p>
    </Card>
  );
}

function QueueCard({ queue }: { queue: ReturnType<typeof usePlanQueue> }) {
  if (queue.isLoading) return <LoadingState description="Loading your queue." />;
  if (queue.isError && queue.error) return <ErrorState error={queue.error} />;
  if (!queue.data) return <LoadingState description="Loading your queue." />;
  if (queue.data.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Your queue is empty."
          description="Find courses in Discover and add them to your queue."
          action={<Link href="/courses">Discover courses</Link>}
        />
      </Card>
    );
  }
  return (
    <Card>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
        <Badge tone="info">
          {queue.data.length} in queue
        </Badge>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.35rem" }}>
        {queue.data.slice(0, 3).map((q) => (
          <li key={q.id} style={{ fontSize: "0.9rem" }}>
            <span style={{ fontWeight: 500 }}>{q.course.title}</span>{" "}
            <span style={{ color: "#555" }}>· {q.statusLabel}</span>
          </li>
        ))}
      </ul>
      {queue.data.length > 3 ? (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#555" }}>
          +{queue.data.length - 3} more in <Link href="/plans">your queue</Link>.
        </p>
      ) : (
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href="/plans">Open plans</Link>
        </p>
      )}
    </Card>
  );
}

function ReadinessCard({ planId }: { planId: number }) {
  const readiness = usePlanReadiness(planId);
  if (readiness.isLoading) return <LoadingState description="Loading readiness." />;
  if (readiness.isError && readiness.error) return <ErrorState error={readiness.error} />;
  if (!readiness.data) return <LoadingState description="Loading readiness." />;
  if (readiness.data.kind === "missing") {
    return (
      <Card>
        <EmptyState title="Readiness not yet computed for this plan." />
      </Card>
    );
  }
  const r = readiness.data.readiness;
  return (
    <Card>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <Badge tone={r.isReadyForScheduleGeneration ? "success" : "warning"}>
          Schedule: {r.isReadyForScheduleGeneration ? "Ready" : "Not ready"}
        </Badge>
        <Badge tone={r.isReadyForExecution ? "success" : "warning"}>
          Execution: {r.isReadyForExecution ? "Ready" : "Not ready"}
        </Badge>
        <Badge tone={r.hasScheduleItems ? "success" : "neutral"}>
          {r.hasScheduleItems ? "Schedule generated" : "Not generated"}
        </Badge>
      </div>
      {r.recommendedActionLabel ? (
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          Suggested next step: <strong>{r.recommendedActionLabel}</strong>
        </p>
      ) : null}
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href={`/plans/${planId}`}>Open plan</Link>
      </p>
    </Card>
  );
}

function NextItemCard({ planId }: { planId: number }) {
  const items = usePlanItems(planId);
  if (items.isLoading) return <LoadingState description="Loading schedule items." />;
  if (items.isError && items.error) return <ErrorState error={items.error} />;
  if (!items.data) return <LoadingState description="Loading schedule items." />;
  if (items.data.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No schedule items yet."
          description="Generate the schedule from plan detail."
          action={<Link href={`/plans/${planId}`}>Open plan</Link>}
        />
      </Card>
    );
  }
  const ordered = items.data
    .slice()
    .sort((a, b) => a.scheduleOrderIndex - b.scheduleOrderIndex);
  const nextActionable = ordered.find(
    (i) => i.isActionable && (i.status === "pending" || i.status === "in_progress"),
  );
  if (!nextActionable) {
    const inProgress = ordered.find((i) => i.status === "in_progress") ?? null;
    const pending = ordered.find((i) => i.status === "pending") ?? null;
    const fallback = inProgress ?? pending ?? null;
    if (!fallback) {
      return (
        <Card>
          <EmptyState
            title="Nothing actionable right now."
            description="All scheduled items are complete or paused."
            action={<Link href={`/plans/${planId}`}>Review plan</Link>}
          />
        </Card>
      );
    }
    return (
      <Card>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
          <Badge tone="neutral">{fallback.statusLabel}</Badge>
          <span style={{ fontSize: "0.85rem", color: "#555" }}>
            {fallback.scheduledDate} · {fallback.timeWindowLabel} ·{" "}
            {fallback.plannedMinutes} min
          </span>
        </div>
        <p style={{ margin: 0, fontWeight: 500 }}>{fallback.title}</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#555" }}>
          {fallback.course.title}
        </p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href={`/plans/${planId}`}>Open plan to act</Link>
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
        <Badge tone={nextActionable.isOverdue ? "danger" : nextActionable.isDueToday ? "info" : "neutral"}>
          {nextActionable.isOverdue
            ? "Overdue"
            : nextActionable.isDueToday
              ? "Due today"
              : nextActionable.statusLabel}
        </Badge>
        <span style={{ fontSize: "0.85rem", color: "#555" }}>
          {nextActionable.scheduledDate} · {nextActionable.timeWindowLabel} ·{" "}
          {nextActionable.plannedMinutes} min
        </span>
      </div>
      <p style={{ margin: 0, fontWeight: 500 }}>{nextActionable.title}</p>
      <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#555" }}>
        {nextActionable.course.title}
      </p>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href={`/plans/${planId}`}>Continue on plan detail</Link>
      </p>
    </Card>
  );
}

/**
 * Execution-summary card. **H-1 hardened display** per
 * NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001 + post-CP10 hardening pass.
 *
 * Until backend fixes the inverted `completionRate` formula, the
 * frontend MUST NOT render the backend percent label anywhere on the
 * Home dashboard — not even on a small secondary line. We render
 * counts only and replace the percent with safe "under review" copy.
 *
 * Rules:
 *   - never show `completionRateLabel` ("99%", "100%", any percent)
 *   - never recompute the percent locally
 *   - never invent a substitute percent
 *   - never headline progress with a single number
 *   - always show counts (Total / Completed / In progress / Pending /
 *     Skipped / Due today / Overdue) — these are reliable.
 */
function ExecutionCountsCard({ planId }: { planId: number }) {
  const summary = useExecutionSummary(planId);
  if (summary.isLoading) return <LoadingState description="Loading progress counts." />;
  if (summary.isError && summary.error) return <ErrorState error={summary.error} />;
  if (!summary.data) return <LoadingState description="Loading progress counts." />;
  const s = summary.data;
  if (s.totalItems === 0) {
    return (
      <Card>
        <EmptyState title="No progress data yet. Generate the schedule to begin." />
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
      {/* H-1 HARDENED: backend completionRateLabel is intentionally NOT
          rendered. Backend formula is under review (see
          NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001). Counts above are the
          reliable source of truth. */}
      <p
        style={{
          margin: "0.5rem 0 0",
          fontSize: "0.75rem",
          color: "#888",
        }}
        data-testid="execution-completion-rate-line"
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

function RecoveryCard({
  planId,
  planRef,
}: {
  planId: number;
  planRef: PublicLearningPlan;
}) {
  // The plan reference is intentionally accepted so that future enhancements
  // can read plan-level state without forcing another fetch; today the card
  // relies on recoveryPreview only.
  void planRef;
  const preview = useRecoveryPreview(planId);
  if (preview.isLoading) return <LoadingState description="Loading recovery preview." />;
  if (preview.isError && preview.error) return <ErrorState error={preview.error} />;
  if (!preview.data) return <LoadingState description="Loading recovery preview." />;
  const p = preview.data;
  if (!p.needsRecovery) {
    return (
      <Card
        headerActions={<Badge tone="success">{p.driftLevelLabel}</Badge>}
      >
        <p style={{ margin: 0, fontSize: "0.9rem" }}>You&apos;re on track right now.</p>
      </Card>
    );
  }
  return (
    <Card
      headerActions={<Badge tone="warning">{p.driftLevelLabel}</Badge>}
    >
      <p style={{ margin: 0, fontSize: "0.9rem" }}>
        Overdue {p.overdueItemsCount} item{p.overdueItemsCount === 1 ? "" : "s"}{" "}
        ({p.overdueMinutes} min) · pressure {p.recoveryPressureLabel}.
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

function AssistantCard({
  conversations,
}: {
  conversations: ReturnType<typeof useAssistantConversations>;
}) {
  if (conversations.isLoading)
    return <LoadingState description="Loading assistant conversations." />;
  if (conversations.isError && conversations.error)
    return <ErrorState error={conversations.error} />;
  if (!conversations.data)
    return <LoadingState description="Loading assistant conversations." />;
  if (conversations.data.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No assistant conversations yet."
          description="Open the assistant to ask about your plan, schedule, or recovery."
          action={<Link href="/assistant">Open assistant</Link>}
        />
      </Card>
    );
  }
  const sorted = conversations.data.slice().sort((a, b) => {
    const ta =
      a.lastAssistantMessageAt ?? a.lastUserMessageAt ?? a.updatedAt;
    const tb =
      b.lastAssistantMessageAt ?? b.lastUserMessageAt ?? b.updatedAt;
    return Date.parse(tb) - Date.parse(ta);
  });
  const recent = sorted[0]!;
  return (
    <Card>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
        <Badge tone="info">{conversations.data.length} conversation{conversations.data.length === 1 ? "" : "s"}</Badge>
        <Badge tone="neutral">{recent.statusLabel}</Badge>
      </div>
      <p style={{ margin: 0, fontWeight: 500 }}>
        {recent.title || `Conversation #${recent.id}`}
      </p>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
        <Link href="/assistant">Open assistant</Link>
      </p>
    </Card>
  );
}

/**
 * Deterministic next-action priority (directive §8.10):
 *   1. no profile → complete profile
 *   2. no queue and no active plan → discover courses
 *   3. queue exists and no active plan → create plan
 *   4. active plan but readiness/items unknown → open plan
 *   5. otherwise → stay on track / open plan
 *
 * No assistant or learning-state heuristic is used here — they belong on
 * the Assistant page and CP11 respectively.
 */
function NextActionCard({
  profile,
  activePlan,
  queue,
  activePlanId,
}: {
  profile: ReturnType<typeof useProfile>;
  activePlan: ReturnType<typeof useActivePlan>;
  queue: ReturnType<typeof usePlanQueue>;
  activePlanId: number | null;
}) {
  // While any prerequisite is still loading we show a calm "Getting your
  // home ready…" so the headline is never momentarily wrong.
  if (profile.isLoading || activePlan.isLoading || queue.isLoading) {
    return (
      <Card>
        <LoadingState description="Getting your home ready." />
      </Card>
    );
  }

  // Profile gate.
  if (profile.data?.kind === "missing") {
    return (
      <Card
        headerActions={<Badge tone="info">First step</Badge>}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>Complete your profile.</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#555" }}>
          A short profile lets us match plans and recommendations to your goals.
        </p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href="/profile">Open profile</Link>
        </p>
      </Card>
    );
  }

  // No active plan paths.
  if (activePlan.data?.kind === "missing") {
    const queueCount = !queue.isError && queue.data ? queue.data.length : 0;
    if (queueCount === 0) {
      return (
        <Card
          headerActions={<Badge tone="info">Discover</Badge>}
        >
          <p style={{ margin: 0, fontWeight: 500 }}>Find courses to study.</p>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#555" }}>
            Add a few courses to your queue, then create a plan from them.
          </p>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
            <Link href="/courses">Discover courses</Link>
          </p>
        </Card>
      );
    }
    return (
      <Card
        headerActions={<Badge tone="info">Create a plan</Badge>}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>You have courses queued.</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#555" }}>
          Turn 1–3 queued courses into a learning plan.
        </p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href="/plans">Open plans</Link>
        </p>
      </Card>
    );
  }

  // Active plan exists.
  if (activePlanId !== null) {
    return (
      <Card
        headerActions={<Badge tone="success">Active plan</Badge>}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>Keep moving on your active plan.</p>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "#555" }}>
          The cards below show progress, recovery, and the next scheduled item.
        </p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
          <Link href={`/plans/${activePlanId}`}>Open active plan</Link>
        </p>
      </Card>
    );
  }

  // Fallback (should be unreachable unless every query returned an
  // unexpected mix; we still render a calm card).
  return (
    <Card>
      <p style={{ margin: 0 }}>
        Use the navigation above to continue. <Link href="/plans">Open plans</Link> or{" "}
        <Link href="/courses">discover courses</Link>.
      </p>
    </Card>
  );
}
