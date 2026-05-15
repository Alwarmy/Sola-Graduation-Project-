"use client";

import Link from "next/link";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/states/LoadingState";
import { useSession } from "@/features/auth/hooks/useSession";

import { AnonymousHome } from "./AnonymousHome";
import { AuthenticatedHome } from "./AuthenticatedHome";

/**
 * B1.CP10 — Home / Learner Dashboard Composition.
 *
 * - Anonymous: clean public landing (Sign in / Register / Discover).
 * - Authenticated: composition of CP4-CP9 backend-backed cards (profile,
 *   active plan, queue, schedule/next item, execution counts, recovery,
 *   assistant, course discovery, next-action). Each card mounts its own
 *   hook and handles its own loading / empty / error state (per-card
 *   partial-failure resilience, directive §22.D).
 *
 * CP10 does NOT:
 *   - implement Progress Analytics (CP11+).
 *   - implement learning-state UI / events UI (CP11+).
 *   - mutate plan/schedule/assistant state from Home — every action card
 *     LINKS to the owning domain page.
 *   - silently recompute or promote the backend's faulty `completionRate`
 *     (NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001 — counts shown clearly;
 *     rate label rendered only as a small secondary line).
 */
export function HomePageClient() {
  const session = useSession();

  if (session.isLoading) {
    return (
      <main style={{ maxWidth: "64rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <PageHeader title="SOLA" />
        <Section>
          <LoadingState description="Loading your session." />
        </Section>
      </main>
    );
  }

  const user = session.data?.user ?? null;

  return (
    <main style={{ maxWidth: "64rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      {user ? (
        <AuthenticatedHome user={user} />
      ) : (
        <AnonymousHome sessionError={session.error} />
      )}
      <p style={{ fontSize: "0.75rem", color: "#888", marginTop: "2rem" }}>
        <Link href="/courses">Discover courses</Link>
      </p>
    </main>
  );
}
