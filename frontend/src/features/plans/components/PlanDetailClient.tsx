"use client";

import Link from "next/link";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { ProtectedState } from "@/components/states/ProtectedState";
import { Badge } from "@/components/ui/Badge";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { useSession } from "@/features/auth/hooks/useSession";
import { usePlanDetail } from "@/features/plans/hooks/usePlans";
import { formatDateTime } from "@/lib/formatters/date";
import { PlanCoursesList } from "./PlanCoursesList";
import { PreferencesForm } from "./PreferencesForm";
import { StatusControl } from "./StatusControl";
import { ReadinessPanel } from "./ReadinessPanel";
import { SchedulePanel } from "./SchedulePanel";
import { PlanItemsList } from "./PlanItemsList";
import { ExecutionSummaryPanel } from "./ExecutionSummaryPanel";
import { RecoveryPanel } from "./RecoveryPanel";

export type PlanDetailClientProps = {
  planId: string;
};

export function PlanDetailClient({ planId }: PlanDetailClientProps) {
  const queryClient = useQueryClient();
  const session = useSession();
  const detail = usePlanDetail(planId);

  function refresh() {
    // Pre-CP8 hardening D-9: a conflict on the status path (or on any other
    // plan-scoped mutation) means our local plan.version + scheduleRevision
    // may be stale. Invalidate every query whose result could shift:
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.detail(planId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.readiness(planId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.queue() });
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.list() });
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() });
    // CP8 scopes — safe to invalidate even before CP8 UI lands.
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.items(planId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.executionSummary(planId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.plans.recoveryPreview(planId) });
  }

  if (session.isLoading) return <LoadingState description="Checking your session." />;
  if (!session.data?.user) {
    return (
      <main style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <PageHeader title="Plan" />
        <ProtectedState
          title="Sign in to view this plan."
          action={<Link href="/login">Sign in</Link>}
        />
      </main>
    );
  }

  if (detail.isLoading) return <LoadingState description="Loading plan." />;
  if (detail.isError && detail.error) return <ErrorState error={detail.error} />;
  if (!detail.data) return <LoadingState description="Loading plan." />;
  if (detail.data.kind === "missing") {
    return (
      <main style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <PageHeader title="Plan" />
        <EmptyState
          title="Plan not found."
          action={<Link href="/plans">Back to your plans</Link>}
        />
      </main>
    );
  }
  const plan = detail.data.plan;

  return (
    <main style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <PageHeader
        title={plan.title}
        subtitle={plan.goal}
        actions={
          <span style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Badge tone="info">{plan.statusLabel}</Badge>
            <Link href="/plans">← Back</Link>
          </span>
        }
      />

      <Section title="Readiness">
        <ReadinessPanel planId={plan.id} />
      </Section>

      <Section title="Courses in this plan">
        <PlanCoursesList plan={plan} onRefresh={refresh} />
      </Section>

      <Section title="Scheduling preferences">
        <PreferencesForm plan={plan} onRefresh={refresh} />
      </Section>

      <Section title="Status">
        <StatusControl plan={plan} onRefresh={refresh} />
      </Section>

      <Section title="Schedule">
        <SchedulePanel plan={plan} onRefresh={refresh} />
      </Section>

      <Section title="Schedule items">
        <PlanItemsList planId={plan.id} onRefresh={refresh} />
      </Section>

      <Section title="Progress">
        <ExecutionSummaryPanel planId={plan.id} />
      </Section>

      <Section title="Recovery">
        <RecoveryPanel plan={plan} onRefresh={refresh} />
      </Section>

      <p style={{ fontSize: "0.8rem", color: "#888" }}>
        Last updated {formatDateTime(plan.updatedAt)} · Plan version {plan.version} ·
        Schedule revision {plan.scheduleRevision}
      </p>
    </main>
  );
}
