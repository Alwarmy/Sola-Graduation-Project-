import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  planRecoveryPreviewResponseSchema,
  toPublicRecoveryPreview,
} from "@/lib/contracts/plan-execution";

/**
 * GET /api/plans/[planId]/recovery-preview
 *
 * CP8-dedicated handler for `GET /plans/{plan_id}/recovery-preview`.
 * Adapts to `PublicRecoveryPreview` so `drift_level`,
 * `recovery_pressure_ratio`, recommended action/mode, and available
 * modes are rendered with user-safe labels.
 */
export async function GET(
  _request: NextRequest,
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

  try {
    const result = await backendRequest<unknown>(
      `/plans/${encodeURIComponent(trimmed)}/recovery-preview`,
      {
        method: "GET",
        bearerToken: accessToken,
      },
    );
    const parsed = planRecoveryPreviewResponseSchema.parse(result.data);
    const safe = toPublicRecoveryPreview(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
