import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  learningPlanItemActionResultResponseSchema,
  learningPlanItemSkipRequestSchema,
  toPublicPlanItemActionResult,
} from "@/lib/contracts/plan-execution";

/**
 * POST /api/plans/[planId]/items/[itemId]/skip
 *
 * CP8-dedicated handler for `POST /plans/{plan_id}/items/{item_id}/skip`.
 *
 * **Concurrency:** `expected_version` (≥1) BODY is REQUIRED.
 * Optional `skip_reason` (1–300 chars) BODY.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ planId: string; itemId: string }> },
): Promise<NextResponse> {
  const { planId, itemId } = await ctx.params;
  const planIdTrim = (planId ?? "").trim();
  const itemIdTrim = (itemId ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(planIdTrim) || !/^[1-9][0-9]*$/.test(itemIdTrim)) {
    return NextResponse.json(
      {
        detail: "Plan id and item id must be positive integers.",
        error_code: "request_validation_error",
      },
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
  const parsedInput = learningPlanItemSkipRequestSchema.safeParse(payload);
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
      `/plans/${encodeURIComponent(planIdTrim)}/items/${encodeURIComponent(itemIdTrim)}/skip`,
      {
        method: "POST",
        json: parsedInput.data,
        bearerToken: accessToken,
      },
    );
    const parsed = learningPlanItemActionResultResponseSchema.parse(result.data);
    const safe = toPublicPlanItemActionResult(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
