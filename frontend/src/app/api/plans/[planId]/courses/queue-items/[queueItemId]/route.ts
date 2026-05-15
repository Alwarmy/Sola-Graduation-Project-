import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER, EXPECTED_VERSION_HEADER } from "@/lib/api/headers";
import {
  learningPlanResponseSchema,
  toPublicLearningPlan,
} from "@/lib/contracts/plans";

/**
 * POST /api/plans/[planId]/courses/queue-items/[queueItemId]
 *
 * CP7-dedicated handler for `POST /plans/{plan_id}/courses/queue-items/{queue_item_id}`.
 * Adds a queued course to an existing plan. **Requires `X-Expected-Version` header.**
 *
 * The browser sends the current `plan.version` via the `x-expected-version`
 * request header; the handler forwards it to the backend exactly. On
 * stale-version conflict (409/412 or `expected_version_mismatch`), the
 * BackendError envelope is propagated; the hook surfaces `<ConflictState>`
 * and refetches.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ planId: string; queueItemId: string }> },
): Promise<NextResponse> {
  const { planId, queueItemId } = await ctx.params;
  if (!planId?.trim() || !queueItemId?.trim()) {
    return NextResponse.json(
      { detail: "Plan id and queue item id are required.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) {
    return NextResponse.json(
      { detail: "Not authenticated", error_code: "not_authenticated" },
      { status: 401 },
    );
  }

  const expectedVersionHeader = request.headers.get(EXPECTED_VERSION_HEADER.toLowerCase());
  const expectedVersion = expectedVersionHeader != null ? Number.parseInt(expectedVersionHeader, 10) : NaN;
  if (!Number.isFinite(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json(
      {
        detail: "Expected plan version is required.",
        error_code: "request_validation_error",
      },
      { status: 422 },
    );
  }

  try {
    const result = await backendRequest<unknown>(
      `/plans/${encodeURIComponent(planId.trim())}/courses/queue-items/${encodeURIComponent(queueItemId.trim())}`,
      {
        method: "POST",
        bearerToken: accessToken,
        expectedVersion,
      },
    );
    const parsed = learningPlanResponseSchema.parse(result.data);
    const safe = toPublicLearningPlan(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
