"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import type { PublicSession } from "@/lib/auth/session";
import { ANONYMOUS_SESSION } from "@/lib/auth/session";
import { authFetch } from "@/features/auth/api/client";

/**
 * Logout mutation.
 *
 * On success: drop the session from the cache to its anonymous shape and
 * then `clear()` the entire React Query cache so that any future feature
 * pages mounted earlier do not retain authenticated-user data on screen.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation<PublicSession, Error, void>({
    mutationFn: () => authFetch<PublicSession>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.auth.session(), ANONYMOUS_SESSION);
      queryClient.clear();
    },
  });
}
