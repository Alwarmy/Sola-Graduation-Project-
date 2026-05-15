"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import type { PublicSession } from "@/lib/auth/session";
import { authFetch } from "@/features/auth/api/client";

/**
 * Hook for the current session. Reads `/api/auth/session` (server-side
 * gateway). Always returns a defined `PublicSession`: an anonymous session
 * (`{ user: null }`) is a valid, queryable state — not an error.
 */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: ({ signal }) => authFetch<PublicSession>("/api/auth/session", { signal }),
    // Per-query overrides on top of the QueryClient defaults:
    staleTime: 30_000,
    // Even when unauthenticated, treat the response as valid data, not error.
  });
}
