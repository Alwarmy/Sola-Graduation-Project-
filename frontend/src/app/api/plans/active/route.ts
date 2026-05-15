import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  learningPlanResponseSchema,
  toPublicLearningPlan,
} from "@/lib/contracts/plans";

/**
 * GET /api/plans/active
 *
 * Post-CP10 hardening dedicated safe read for the learner's active
 * plan. Strips nested raw `CourseResponse` fields server-side via
 * `toPublicLearningPlan`. 404 is propagated as a safe envelope so the
 * client hook can map it to `{kind:"missing"}`.
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
    const result = await backendRequest<unknown>("/plans/active", {
      method: "GET",
      bearerToken: accessToken,
    });
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
