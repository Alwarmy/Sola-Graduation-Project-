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
 * POST /api/learning-state/refresh
 *
 * CP11-dedicated handler for backend `POST /learning-state/refresh`.
 * Backend takes no body and returns the same shape as the GET — so
 * we adapt via `toPublicLearningState` to keep network bodies clean.
 *
 * UI rules (per directive §12 + addendum §C):
 *   - explicit user click only (never auto-run on page load)
 *   - authenticated only
 *   - hook returns the new safe public state
 *   - after success, the hook invalidates `learningState.current()` +
 *     `events.list()` + plan-scoped queries so cards re-fetch.
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) {
    return NextResponse.json(
      { detail: "Not authenticated", error_code: "not_authenticated" },
      { status: 401 },
    );
  }
  try {
    const result = await backendRequest<unknown>("/learning-state/refresh", {
      method: "POST",
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
