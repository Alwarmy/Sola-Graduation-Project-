import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import { courseCardResponseSchema, toPublicCourseCard } from "@/lib/contracts/courses";

/**
 * GET /api/courses/[courseId]
 *
 * Optional-auth course detail handler. Same rationale as `/api/courses`:
 * the backend route accepts no-token at runtime, so anonymous detail
 * browsing must work; forwarding the bearer when present lets the backend
 * personalize the response. Bypasses `/api/sola/[...path]` (which is
 * protected-only) by design.
 *
 * `courseId` is validated as a non-empty string and URL-encoded before it
 * reaches the backend. 404 is propagated through `backendErrorResponse`
 * so the client can map it to the safe "course not found" state.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
): Promise<NextResponse> {
  const { courseId } = await ctx.params;
  const trimmed = (courseId ?? "").trim();
  if (trimmed.length === 0) {
    return NextResponse.json(
      { detail: "Course id is required.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }
  // Pre-CP8 hardening D-5: backend course ids are positive integers. A
  // non-numeric segment in the URL is best surfaced to the learner as
  // "Course not found." (the useCourseDetail 404 → {kind:"missing"} path)
  // rather than a form-validation surface that says "Please review the
  // highlighted fields.".
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    return NextResponse.json(
      { detail: "Course not found.", error_code: "not_found" },
      { status: 404 },
    );
  }

  const accessToken = await readAccessTokenCookie();
  const backendPath = `/courses/${encodeURIComponent(trimmed)}`;

  try {
    const result = await backendRequest<unknown>(backendPath, {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = courseCardResponseSchema.parse(result.data);
    const safe = toPublicCourseCard(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
