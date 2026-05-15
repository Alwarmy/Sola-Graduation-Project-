"use client";

import { useState } from "react";

import { PageHeader, Section } from "@/components/layout/PageHeader";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { UnavailableState } from "@/components/states/UnavailableState";

import { SearchBox } from "./SearchBox";
import { CourseGrid } from "./CourseGrid";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { useCourseSearch } from "@/features/courses/hooks/useCourseSearch";
import { useCourseCatalog } from "@/features/courses/hooks/useCourseCatalog";
import { COURSE_SEARCH_SOURCE_UNAVAILABLE_COPY } from "@/lib/contracts/courses";

/**
 * Discover page client.
 *
 * Shows:
 *   - Search box (always)
 *   - Either search results OR (when no query yet) a curated catalog
 *   - Recommendations (auth-gated; panel handles ProtectedState itself)
 *
 * The search box NEVER exposes the "ingest" wording. The pipeline
 * orchestration is hidden on the server-side handler `/api/courses/search`.
 */
export function CoursesPageClient() {
  const [query, setQuery] = useState("");
  const search = useCourseSearch(query.length > 0 ? { q: query, limit: 12 } : null);
  const catalog = useCourseCatalog({ limit: 12 });

  return (
    <main style={{ maxWidth: "72rem", margin: "2rem auto", padding: "0 1.5rem" }}>
      <PageHeader
        title="Discover courses"
        subtitle="Find courses curated for your goals. Results are real backend search output."
      />

      <Section>
        <SearchBox initialQuery={query} isBusy={search.isFetching} onSubmit={setQuery} />
      </Section>

      {query.length === 0 ? (
        <Section title="Catalog">
          {catalog.isLoading ? (
            <LoadingState description="Loading catalog." />
          ) : catalog.isError && catalog.error ? (
            <ErrorState error={catalog.error} />
          ) : catalog.data && catalog.data.length > 0 ? (
            <CourseGrid courses={catalog.data} />
          ) : (
            <EmptyState
              title="Nothing in the catalog yet."
              description="Try searching above — we'll bring in fresh courses."
            />
          )}
        </Section>
      ) : (
        <Section title={`Results for “${query}”`}>
          {search.isLoading ? (
            <LoadingState description="Searching courses." />
          ) : search.isError && search.error ? (
            <ErrorState error={search.error} />
          ) : search.data ? (
            <>
              {/* When the upstream provider is unavailable AND there are
                  no curated results, show the locked source-unavailable copy
                  alongside the empty grid. */}
              {search.data.search.items.length === 0 &&
              search.data.sourceStatus === "stale" ? (
                <UnavailableState title={COURSE_SEARCH_SOURCE_UNAVAILABLE_COPY} />
              ) : search.data.search.items.length === 0 ? (
                <EmptyState
                  title="No courses found for this search yet."
                  description="Try a different topic."
                />
              ) : (
                <CourseGrid courses={search.data.search.items} />
              )}
            </>
          ) : null}
        </Section>
      )}

      <Section title="Recommended for you">
        <RecommendationsPanel limit={6} />
      </Section>
    </main>
  );
}
