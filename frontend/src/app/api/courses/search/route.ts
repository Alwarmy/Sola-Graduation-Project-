import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  courseSearchParamsSchema,
  courseSearchResponseSchema,
  toPublicCourseSearch,
  type CourseSearchParams,
  type PublicCourseSearch,
} from "@/lib/contracts/courses";

/**
 * POST /api/courses/search
 *
 * Server-side Course Search Pipeline orchestrator (locked in CP1, implemented
 * in CP6 per the plan §22 — input via `POST /courses/ingest`, output via
 * `GET /courses/search` with the same query, display = curated results only).
 *
 * Browser flow:
 *   1. Browser posts `{ q, language?, content_type?, ..., limit, offset }`.
 *   2. Server reads the access-token cookie if present.
 *   3. If authenticated AND `q` is non-empty AND the server-side ingest is
 *      safe to attempt, server calls `POST /courses/ingest { query: q,
 *      max_results_per_type }`. The response body is **discarded**; only
 *      a "fresh source attempt" flag is recorded.
 *      - Provider/source errors (404, 502, 5xx, network) are swallowed —
 *        ingest is a best-effort freshness hint; the search step still runs.
 *      - 401/403 indicate the access cookie is stale; ingest is skipped.
 *   4. Server calls `GET /courses/search?<params>` (always; the only display
 *      source). Bearer is forwarded if available so the backend can
 *      personalize.
 *   5. Response is mapped to a browser-safe `PublicCourseSearch`. The
 *      ingest response body is NEVER returned to the browser.
 *
 * No "ingest" wording is ever exposed to the browser. The `sourceFresh`
 * flag is purely metadata; the UI can use it to decide whether to surface
 * the locked source-unavailable copy alongside curated results.
 */

const INGEST_MAX_RESULTS_PER_TYPE = 10;

type SearchSourceStatus = "fresh" | "stale" | "anonymous" | "skipped";

type BrowserResponseShape = {
  search: PublicCourseSearch;
  sourceStatus: SearchSourceStatus;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }

  const parsedInput = courseSearchParamsSchema.safeParse(payload);
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

  const params = parsedInput.data;
  const accessToken = await readAccessTokenCookie();

  // Step 1: best-effort ingest (hidden orchestration). Never echoes anything
  // to the browser, never throws.
  const sourceStatus = await tryFreshIngest(params, accessToken);

  // Step 2: search (the only display source).
  try {
    const searchPath = buildSearchPath(params);
    const result = await backendRequest<unknown>(searchPath, {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = courseSearchResponseSchema.parse(result.data);
    const browserShape: BrowserResponseShape = {
      search: toPublicCourseSearch(parsed),
      sourceStatus,
    };
    const response = NextResponse.json<BrowserResponseShape>(browserShape, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}

async function tryFreshIngest(
  params: CourseSearchParams,
  accessToken: string | undefined,
): Promise<SearchSourceStatus> {
  if (!accessToken) return "anonymous";
  const query = (params.q ?? "").trim();
  if (query.length === 0) return "skipped";
  try {
    await backendRequest<unknown>("/courses/ingest", {
      method: "POST",
      json: { query, max_results_per_type: INGEST_MAX_RESULTS_PER_TYPE },
      bearerToken: accessToken,
    });
    return "fresh";
  } catch (err) {
    // Provider/source unavailability is expected in many environments.
    // Log structured server-side; never propagate to the browser.
    if (err instanceof BackendError) {
      console.warn(
        `[courses/search] background source refresh skipped status=${err.status} ` +
          `error_code=${err.errorCode ?? "n/a"} request_id=${err.requestId ?? "n/a"}`,
      );
    } else {
      console.warn(`[courses/search] background source refresh threw: ${String(err)}`);
    }
    return "stale";
  }
}

function buildSearchPath(params: CourseSearchParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (typeof value === "string" && value.length === 0) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs.length > 0 ? `/courses/search?${qs}` : "/courses/search";
}

export type { BrowserResponseShape as CourseSearchPipelineResult };
export type { SearchSourceStatus };
