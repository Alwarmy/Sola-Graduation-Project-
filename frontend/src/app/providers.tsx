"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { BackendError } from "@/lib/errors/backend-error";

/**
 * React Query provider with SOLA-specific defaults.
 *
 * Defaults (documented for CP3 acceptance; revisit per checkpoint as
 * features land):
 *
 *   - `staleTime: 30_000` (30s)
 *       Reasonable balance for learner data that changes on user actions.
 *       Per-query overrides will tune frequently-changing endpoints
 *       (`learning-state`, `assistant`) down and stable catalog endpoints
 *       (`courses/{id}`) up.
 *
 *   - `gcTime: 5 * 60_000` (5 min)
 *       Default React Query value, kept explicit so the choice is visible.
 *
 *   - `refetchOnWindowFocus: true`, `refetchOnReconnect: true`
 *       Defaults — keeps learner views consistent after tab switches and
 *       network blips.
 *
 *   - `retry`: do NOT retry 4xx `BackendError`s. They are deterministic
 *       (validation, auth, not-found, conflict). 5xx and network errors
 *       retry up to 2 times.
 *
 *   - `mutations.retry: false`
 *       Mutations are intentful user actions; retry policy is owned by
 *       the calling hook + UI confirmation.
 *
 * Hydration / streaming SSR:
 *   Deferred. CP3 does not server-prefetch any feature query because no
 *   feature query consumer exists yet. When the first feature page lands
 *   (CP4 onwards), revisit and add `HydrationBoundary` plus per-request
 *   `QueryClient` factory if needed for SSR.
 */
export function Providers({ children }: { children: ReactNode }) {
  // Create the client ONCE per browser session. `useState` ensures it does
  // not regenerate on every render, which would discard the cache.
  const [client] = useState(() => makeQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          if (error instanceof BackendError) {
            // Deterministic backend errors should not be retried.
            if (error.status >= 400 && error.status < 500) return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
