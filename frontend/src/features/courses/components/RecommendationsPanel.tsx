"use client";

import Link from "next/link";

import { useSession } from "@/features/auth/hooks/useSession";
import { useRecommendations } from "@/features/courses/hooks/useRecommendations";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { ProtectedState } from "@/components/states/ProtectedState";
import { CourseGrid } from "./CourseGrid";

/**
 * Recommendations are authenticated-only. When the user is anonymous, we
 * render a safe ProtectedState with a Sign-in CTA — we do NOT fall back to
 * any local list (no fake/recommendation data is allowed per CP6 rules).
 */
export function RecommendationsPanel({ limit = 6 }: { limit?: number }) {
  const session = useSession();
  const hasSession = Boolean(session.data?.user);
  const recs = useRecommendations({ limit, enabled: hasSession });

  if (session.isLoading) return <LoadingState description="Loading your session." />;
  if (!hasSession) {
    return (
      <ProtectedState
        title="Sign in to see personalized recommendations."
        action={<Link href="/login">Sign in</Link>}
      />
    );
  }
  if (recs.isLoading) return <LoadingState description="Loading your recommendations." />;
  if (recs.isError && recs.error) return <ErrorState error={recs.error} />;

  const list = recs.data;
  if (!list || list.items.length === 0) {
    return (
      <EmptyState
        title="No recommendations yet."
        description="Update your profile to help us tailor recommendations to your goals."
      />
    );
  }

  const explanationByCourseId: Record<number, string | null> = {};
  for (const r of list.items) explanationByCourseId[r.id] = r.explanationSummary;

  return <CourseGrid courses={list.items} explanationByCourseId={explanationByCourseId} />;
}
