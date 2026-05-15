import { queryKeys } from "@/lib/query/query-keys";

/**
 * Mutation → query-key invalidation map.
 *
 * Seeded from the mutation invalidation sample in
 * `SOLA_Backend_Deep_Frontend_Reference_v3_1` §5. The list is intentionally
 * partial in CP2 (covers the foundation needs of CP4–CP11); each owning
 * checkpoint must extend its own entry when its mutation lands.
 *
 * Hooks compose this against React Query's `invalidateQueries` (or a
 * library-agnostic substitute) when a mutation succeeds. The map returns
 * key prefixes; callers pass them as `queryKey` to invalidate.
 */
export const mutationInvalidation = {
  "auth.login": (): readonly (readonly unknown[])[] => [
    queryKeys.auth.session(),
    queryKeys.auth.user(),
    queryKeys.profile.me(),
    queryKeys.home.composition(),
  ],
  "auth.logout": (): readonly (readonly unknown[])[] => [
    queryKeys.auth.session(),
    queryKeys.auth.user(),
    // All protected queries should be cleared by the consumer; this list
    // captures the minimum the foundation knows about.
  ],
  "auth.refresh": (): readonly (readonly unknown[])[] => [
    queryKeys.auth.session(),
    queryKeys.auth.user(),
  ],
  "auth.register": (): readonly (readonly unknown[])[] => [
    // Register returns UserResponse, not a Token. Frontend must route to
    // /login after success. No session-related queries are invalidated.
  ],
  "profile.upsert": (): readonly (readonly unknown[])[] => [
    queryKeys.profile.me(),
    queryKeys.auth.session(),
    queryKeys.home.composition(),
  ],
  "courses.ingest": (): readonly (readonly unknown[])[] => [
    // The ingest call is part of the course search pipeline and the UI
    // immediately follows it with a search call. The search query is the
    // primary invalidation target.
  ],
  "plans.create": (): readonly (readonly unknown[])[] => [
    queryKeys.plans.list(),
    queryKeys.plans.active(),
    queryKeys.plans.queue(),
    queryKeys.home.composition(),
  ],
} as const;

export type MutationKey = keyof typeof mutationInvalidation;
