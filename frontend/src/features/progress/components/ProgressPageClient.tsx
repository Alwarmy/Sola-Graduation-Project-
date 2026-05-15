"use client";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/states/LoadingState";
import { useSession } from "@/features/auth/hooks/useSession";

import { AnonymousProgress } from "./AnonymousProgress";
import { AuthenticatedProgress } from "./AuthenticatedProgress";

/**
 * B1.CP11 — `/progress` page client. Session router only.
 * - Loading: calm "Checking your session." card.
 * - Anonymous: ProtectedState with sign-in CTA. NO authed fetches.
 * - Authenticated: full progress composition.
 *
 * CP11 does NOT implement Progress Analytics — no charts, no streaks,
 * no fake trends. Counts-first display. `completionRateLabel` is
 * never rendered while NOTE-CP9-CP10-H1-EXECUTION-SUMMARY-001 is open.
 */
export function ProgressPageClient() {
  const session = useSession();

  if (session.isLoading) {
    return (
      <main style={{ maxWidth: "64rem", margin: "2rem auto", padding: "0 1.5rem" }}>
        <PageHeader title="Progress" />
        <Section>
          <LoadingState description="Checking your session." />
        </Section>
      </main>
    );
  }

  const user = session.data?.user ?? null;
  if (!user) return <AnonymousProgress />;
  return <AuthenticatedProgress user={user} />;
}
