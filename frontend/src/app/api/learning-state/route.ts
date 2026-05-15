import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  toPublicLearningState,
  userLearningStateResponseSchema,
} from "@/lib/contracts/learning-state";

/**
 * GET /api/learning-state
 *
 * CP11-dedicated handler for backend `GET /learning-state`. Adapts
 * server-side via `toPublicLearningState` so the raw internal dicts
 * (`topic_familiarity`, `topic_families`, `source_profile_snapshot`,
 * `source_event_summary`, `profile_alignment`) and `user_id` never
 * reach the browser. 404 is propagated as a safe envelope so the
 * client hook can map it to `{kind:"missing"}`.
 *
 * Frontend path is `/api/learning-state` (matches backend canonical
 * path `/learning-state`, NOT the directive's `/current` suffix —
 * runtime/backend truth wins per Authority Order).
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
    const result = await backendRequest<unknown>("/learning-state", {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = userLearningStateResponseSchema.parse(result.data);
    const safe = toPublicLearningState(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
