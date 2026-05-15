import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  schedulingPreferenceResponseSchema,
  schedulingPreferenceUpdateRequestSchema,
  toPublicSchedulingPreference,
} from "@/lib/contracts/plans";

/**
 * PUT /api/plans/[planId]/preferences
 *
 * CP7-dedicated handler for `PUT /plans/{plan_id}/preferences`. Updates
 * scheduling preferences for the plan.
 *
 * **Concurrency:** `expected_version` is REQUIRED in the body (matches the
 * backend `SchedulingPreferenceUpdateRequest` schema). Frontend always
 * sends `plan.version`. On stale-version conflict, the BackendError
 * propagates; the hook surfaces `<ConflictState>` and refetches the
 * plan + preferences + readiness.
 */
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ planId: string }> },
): Promise<NextResponse> {
  const { planId } = await ctx.params;
  if (!planId?.trim()) {
    return NextResponse.json(
      { detail: "Plan id is required.", error_code: "request_validation_error" },
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }
  const parsedInput = schedulingPreferenceUpdateRequestSchema.safeParse(payload);
  if (!parsedInput.success) {
    return NextResponse.json(
      {
        detail: "Request validation failed.",
        error_code: "request_validation_error",
        details: {
          errors: parsedInput.error.issues.map((i) => ({
            type: i.code,
            loc: ["body", ...i.path.map(String)],
            msg: i.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  try {
    const result = await backendRequest<unknown>(
      `/plans/${encodeURIComponent(planId.trim())}/preferences`,
      {
        method: "PUT",
        json: parsedInput.data,
        bearerToken: accessToken,
      },
    );
    const parsed = schedulingPreferenceResponseSchema.parse(result.data);
    const safe = toPublicSchedulingPreference(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
