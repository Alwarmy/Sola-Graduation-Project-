import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  learningPlanItemResponseSchema,
  toPublicPlanItem,
} from "@/lib/contracts/plan-execution";

/**
 * GET /api/plans/[planId]/items
 *
 * CP8-dedicated handler for `GET /plans/{plan_id}/items`.
 *
 * Backend returns an array of `LearningPlanItemResponse`. We adapt each
 * to `PublicPlanItem` so the browser never sees `item_metadata`,
 * `practical_signal`, `load_signal`, full admin course payload, or other
 * internal fields.
 *
 * Supports optional query params `status_filter` and `actionable_only`
 * mirroring the backend.
 */
const planItemsArraySchema = z.array(learningPlanItemResponseSchema);

export async function GET(
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

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status_filter")?.trim() || null;
  const actionableOnly = url.searchParams.get("actionable_only");
  const query = new URLSearchParams();
  if (statusFilter) query.set("status_filter", statusFilter);
  if (actionableOnly === "true") query.set("actionable_only", "true");
  const qs = query.toString();
  const backendPath = `/plans/${encodeURIComponent(trimmed)}/items${qs ? `?${qs}` : ""}`;

  try {
    const result = await backendRequest<unknown>(backendPath, {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = planItemsArraySchema.parse(result.data);
    const safe = parsed.map(toPublicPlanItem);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
