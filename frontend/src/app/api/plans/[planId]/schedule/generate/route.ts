import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  planScheduleGenerateRequestSchema,
  planScheduleGenerateResponseSchema,
  toPublicScheduleGenerationResult,
} from "@/lib/contracts/plan-execution";

/**
 * POST /api/plans/[planId]/schedule/generate
 *
 * CP8-dedicated handler for `POST /plans/{plan_id}/schedule/generate`.
 *
 * **Concurrency:** `expected_version` is REQUIRED in the body
 * (frontend always sends `plan.version`). `expected_schedule_revision`
 * is OPTIONAL in the body (sent only when the UI knows the current
 * schedule_revision). Conflict → `BackendError` → `<ConflictPanel>`
 * + refetch on the client.
 *
 * Returns the safe `PublicScheduleGenerationResult` (raw items adapted
 * to `PublicPlanItem`; no `item_metadata`/admin course leak).
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ planId: string }> },
): Promise<NextResponse> {
  const { planId } = await ctx.params;
  const trimmed = (planId ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
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
  const parsedInput = planScheduleGenerateRequestSchema.safeParse(payload);
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
      `/plans/${encodeURIComponent(trimmed)}/schedule/generate`,
      {
        method: "POST",
        json: parsedInput.data,
        bearerToken: accessToken,
      },
    );
    const parsed = planScheduleGenerateResponseSchema.parse(result.data);
    const safe = toPublicScheduleGenerationResult(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
