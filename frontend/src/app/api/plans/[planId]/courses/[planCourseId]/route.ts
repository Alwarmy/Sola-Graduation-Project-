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
 * DELETE /api/plans/[planId]/courses/[planCourseId]
 *
 * CP7-dedicated handler for `DELETE /plans/{plan_id}/courses/{plan_course_id}`.
 * Removes a plan course. **Requires `X-Expected-Version` header.**
 *
 * Browser sends current `plan.version` via the `x-expected-version` header.
 * The handler forwards it to the backend. On stale conflict, the
 * BackendError envelope is propagated to the hook → UI surfaces
 * `<ConflictState>` + refetch.
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ planId: string; planCourseId: string }> },
): Promise<NextResponse> {
  const { planId, planCourseId } = await ctx.params;
  if (!planId?.trim() || !planCourseId?.trim()) {
    return NextResponse.json(
      { detail: "Plan id and plan-course id are required.", error_code: "request_validation_error" },
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
      `/plans/${encodeURIComponent(planId.trim())}/courses/${encodeURIComponent(planCourseId.trim())}`,
      {
        method: "DELETE",
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
