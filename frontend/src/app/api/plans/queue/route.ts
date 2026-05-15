import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  scheduleQueueItemResponseSchema,
  toPublicQueueItem,
} from "@/lib/contracts/plans";

const queueListResponseSchema = z.array(scheduleQueueItemResponseSchema);

/**
 * GET /api/plans/queue
 *
 * Post-CP10 hardening dedicated safe read for the learner's schedule
 * queue. Adapts each row via `toPublicQueueItem` server-side so the
 * nested `course` field passes through `toPublicCourseCard` —
 * `provider_metadata` and `quality_signals` are stripped before the
 * browser sees the response. (NOTE-CP10-CP11-PLANS-PASSTHROUGH-001.)
 *
 * NOT to be confused with `/api/plans/queue/[id]` which is the CP7
 * per-queue-item POST + DELETE mutation handler.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) {
    return NextResponse.json(
      { detail: "Not authenticated", error_code: "not_authenticated" },
      { status: 401 },
    );
  }
  try {
    const result = await backendRequest<unknown>("/plans/queue", {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = queueListResponseSchema.parse(result.data);
    const safe = parsed.map(toPublicQueueItem);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
