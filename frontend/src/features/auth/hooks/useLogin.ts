"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import type { PublicSession } from "@/lib/auth/session";
import { authFetch } from "@/features/auth/api/client";
import type { UserLogin } from "@/lib/contracts/auth";

/**
 * Login mutation.
 *
 * On success: invalidate session-related queries and seed the session cache
 * with the fresh PublicSession so the next render does not flicker through
 * "unauthenticated" before the refetch finishes.
 */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<PublicSession, Error, UserLogin>({
    mutationFn: (input) => authFetch<PublicSession>("/api/auth/login", { method: "POST", json: input }),
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.auth.session(), session);
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.session() });
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.user() });
    },
  });
}
