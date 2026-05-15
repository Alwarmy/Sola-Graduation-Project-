"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { profileFetch } from "@/features/profile/api/client";
import {
  toPublicProfile,
  userProfileResponseSchema,
  type PublicProfile,
} from "@/lib/contracts/profile";
import { BackendError } from "@/lib/errors/backend-error";

export type ProfileQueryResult =
  | { kind: "missing" }
  | { kind: "loaded"; profile: PublicProfile };

/**
 * Read the current learner's profile.
 *
 * Treats 404 as a valid "no profile yet" result (`kind: "missing"`) instead
 * of an error, so the UI can render the create-profile form. All other
 * non-2xx responses propagate as a `BackendError` (auth, server, etc.).
 *
 * `enabled` defaults to `true`; pages can pass `enabled: hasSession` to
 * avoid an unauthenticated round-trip.
 */
export function useProfile(options?: { enabled?: boolean }) {
  return useQuery<ProfileQueryResult, BackendError>({
    queryKey: queryKeys.profile.me(),
    enabled: options?.enabled ?? true,
    queryFn: async ({ signal }): Promise<ProfileQueryResult> => {
      try {
        const data = await profileFetch<unknown>("/profile", { signal });
        const parsed = userProfileResponseSchema.parse(data);
        return { kind: "loaded", profile: toPublicProfile(parsed) };
      } catch (err) {
        if (err instanceof BackendError && err.status === 404) {
          return { kind: "missing" };
        }
        throw err;
      }
    },
    // Profile is stable user data; the 30s default from the provider is fine.
  });
}
