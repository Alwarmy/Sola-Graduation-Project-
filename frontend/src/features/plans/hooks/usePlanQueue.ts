"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/query-keys";
import { plansFetch } from "@/features/plans/api/client";
import { plansSafeFetch } from "@/features/plans/api/safe-reads";
import type { PublicQueueItem } from "@/lib/contracts/plans";
import type { BackendError } from "@/lib/errors/backend-error";

/**
 * Read the learner's queue. Authenticated. Empty array when nothing is queued.
 *
 * Post-CP10 hardening: moved off `/api/sola/[...path]` (which leaked nested
 * raw `CourseResponse` fields) to the dedicated `GET /api/plans/queue`
 * server-side adapter (NOTE-CP10-CP11-PLANS-PASSTHROUGH-001).
 */
export function usePlanQueue(options?: { enabled?: boolean }) {
  return useQuery<PublicQueueItem[], BackendError>({
    queryKey: queryKeys.plans.queue(),
    enabled: options?.enabled ?? true,
    queryFn: ({ signal }) =>
      plansSafeFetch<PublicQueueItem[]>("/api/plans/queue", { signal }),
    staleTime: 15_000,
  });
}

/**
 * Add a course to the queue (`POST /plans/queue/{course_id}`).
 * On success: invalidate queue + courses (queue badges may follow later).
 */
export function useAddCourseToQueue() {
  const queryClient = useQueryClient();
  return useMutation<PublicQueueItem, BackendError, { courseId: number | string; note?: string | null }>({
    mutationFn: async ({ courseId, note }) =>
      plansFetch<PublicQueueItem>(`/api/plans/queue/${encodeURIComponent(String(courseId))}`, {
        method: "POST",
        json: { note: note ?? null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.queue() });
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.composition() });
    },
  });
}

/**
 * Remove a queue item (`DELETE /plans/queue/{queue_item_id}`).
 */
export function useRemoveQueueItem() {
  const queryClient = useQueryClient();
  return useMutation<void, BackendError, { queueItemId: number | string }>({
    mutationFn: async ({ queueItemId }) => {
      await plansFetch<{ ok: boolean }>(
        `/api/plans/queue/${encodeURIComponent(String(queueItemId))}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.queue() });
      queryClient.invalidateQueries({ queryKey: queryKeys.plans.active() });
      queryClient.invalidateQueries({ queryKey: queryKeys.home.composition() });
    },
  });
}
