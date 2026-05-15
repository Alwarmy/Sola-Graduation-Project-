import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import {
  EXPECTED_VERSION_HEADER,
  REQUEST_ID_HEADER,
} from "@/lib/api/headers";
import {
  learningPlanItemActionResultResponseSchema,
  toPublicPlanItemActionResult,
} from "@/lib/contracts/plan-execution";

/**
 * POST /api/plans/[planId]/items/[itemId]/start
 *
 * CP8-dedicated handler for `POST /plans/{plan_id}/items/{item_id}/start`.
 *
 * **Concurrency:** `X-Expected-Version` HEADER (≥1) is REQUIRED.
 * Mirrors the `POST /plans/{plan}/courses/queue-items/{queueItemId}`
 * CP7 pattern. The browser sends the item's own `version` via
 * `plansFetch({expectedVersion})`; we forward it verbatim to the
 * backend via `backendRequest({expectedVersion})`.
 */
function parseExpectedVersionHeader(request: NextRequest): number | null {
  const raw = request.headers.get(EXPECTED_VERSION_HEADER) ?? request.headers.get(EXPECTED_VERSION_HEADER.toLowerCase());
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

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

  const expectedVersion = parseExpectedVersionHeader(request);
  if (expectedVersion === null) {
    return NextResponse.json(
      {
        detail: "X-Expected-Version header is required and must be a positive integer.",
        error_code: "request_validation_error",
        details: {
          errors: [
            {
              type: "missing",
              loc: ["header", EXPECTED_VERSION_HEADER],
              msg: "X-Expected-Version is required",
            },
          ],
        },
      },
      { status: 422 },
    );
  }

  try {
    const result = await backendRequest<unknown>(
      `/plans/${encodeURIComponent(planIdTrim)}/items/${encodeURIComponent(itemIdTrim)}/start`,
      {
        method: "POST",
        bearerToken: accessToken,
        expectedVersion,
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
