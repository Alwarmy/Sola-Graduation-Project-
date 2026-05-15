"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { profileFetch } from "@/features/profile/api/client";
import {
  toPublicProfile,
  userProfileResponseSchema,
  type PublicProfile,
  type UserProfileCreate,
} from "@/lib/contracts/profile";

/**
 * Create the learner profile. On success, seed the profile query cache
 * and invalidate downstream queries that depend on profile state
 * (recommendations / learning-state / home composition), per backend
 * reference §5 (mutation-impact sample).
 */
export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation<PublicProfile, Error, UserProfileCreate>({
    mutationFn: async (input) => {
      const data = await profileFetch<unknown>("/profile", {
        method: "POST",
        json: input,
      });
      const parsed = userProfileResponseSchema.parse(data);
      return toPublicProfile(parsed);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile.me(), { kind: "loaded", profile });
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.me() });
      queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.learningState.current() });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.composition() });
    },
  });
}
