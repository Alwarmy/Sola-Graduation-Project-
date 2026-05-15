import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  courseCardResponseSchema,
  toPublicCourseCard,
  type PublicCourseCard,
} from "@/lib/contracts/courses";

/**
 * GET /api/courses
 *
 * Optional-auth catalog handler. Backend `GET /courses` is declared
 * `OAuth2PasswordBearer` in OpenAPI but accepts no-token at runtime
 * (re-verified in CP6). This dedicated handler intentionally bypasses
 * the protected `/api/sola/[...path]` proxy so anonymous browsing works
 * while still forwarding the bearer when a session cookie is present
 * (letting the backend personalize).
 *
 * Browser receives an array of `PublicCourseCard` view models — the
 * raw `provider_metadata`, `quality_signals`, `personalization`, and
 * `discovery` objects are stripped at the schema/adapter boundary.
 *
 * Only the catalog params documented in the OpenAPI snapshot are
 * forwarded; unknown params are dropped to avoid silent passthrough.
 */
const allowedParams = [
  "q",
  "language",
  "content_type",
  "source",
  "difficulty_level",
  "pricing_model",
  "progression_hint",
  "topic_tag",
  "sort_by",
  "limit",
  "offset",
] as const;

const catalogResponseSchema = z.array(courseCardResponseSchema);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = await readAccessTokenCookie();

  const search = new URLSearchParams();
  for (const name of allowedParams) {
    const value = request.nextUrl.searchParams.get(name);
    if (value !== null && value.length > 0) {
      search.set(name, value);
    }
  }
  const qs = search.toString();
  const backendPath = qs.length > 0 ? `/courses?${qs}` : "/courses";

  try {
    const result = await backendRequest<unknown>(backendPath, {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = catalogResponseSchema.parse(result.data);
    const safe: PublicCourseCard[] = parsed.map(toPublicCourseCard);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
