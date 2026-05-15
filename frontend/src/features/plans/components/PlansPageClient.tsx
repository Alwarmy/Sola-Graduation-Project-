"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/states/LoadingState";
import { ProtectedState } from "@/components/states/ProtectedState";

import { useSession } from "@/features/auth/hooks/useSession";
import { ActivePlanSummary } from "./ActivePlanSummary";
import { QueuePanel } from "./QueuePanel";
import { CreatePlanForm } from "./CreatePlanForm";
import { PlanList } from "./PlanList";

export function PlansPageClient() {
  const session = useSession();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  if (session.isLoading) return <LoadingState description="Checking your session." />;
  if (!session.data?.user) {
    return (
      <main style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <PageHeader title="Your plans" />
        <ProtectedState
          title="Sign in to manage your plans."
          action={<Link href="/login">Sign in</Link>}
        />
      </main>
    );
  }

  function toggle(id: number) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 3) return prev; // backend caps queue_item_ids at 3
      return [...prev, id];
    });
  }

  return (
    <main style={{ maxWidth: "56rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <PageHeader
        title="Your plans"
        subtitle="Manage your queue and your learning plans."
        actions={<Link href="/courses">Discover courses</Link>}
      />

      <Section title="Active plan">
        <ActivePlanSummary />
      </Section>

      <Section title="Your queue">
        <QueuePanel
          selectable
          selectedIds={selectedIds}
          onToggleSelected={toggle}
        />
      </Section>

      <Section title="Create a plan from your queue">
        <CreatePlanForm
          selectedQueueItemIds={selectedIds}
          onClearSelection={() => setSelectedIds([])}
        />
      </Section>

      <Section title="All plans">
        <PlanList />
      </Section>
    </main>
  );
}
