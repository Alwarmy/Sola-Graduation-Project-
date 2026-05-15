import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  learningPlanCreateRequestSchema,
  learningPlanResponseSchema,
  toPublicLearningPlan,
} from "@/lib/contracts/plans";

const learningPlanListResponseSchema = z.array(learningPlanResponseSchema);

/**
 * GET /api/plans
 *
 * Post-CP10 hardening dedicated safe read for the plan list. Previously
 * read through `/api/sola/[...path]`, which leaked nested raw
 * `CourseResponse` fields (`provider_metadata`, `quality_signals`) in
 * the browser-facing JSON. This handler adapts each plan via
 * `toPublicLearningPlan` server-side so the network body matches the
 * rendered DOM. (NOTE-CP10-CP11-PLANS-PASSTHROUGH-001.)
 */
export async function GET(): Promise<NextResponse> {
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) {
    return NextResponse.json(
      { detail: "Not authenticated", error_code: "not_authenticated" },
      { status: 401 },
    );
  }
  try {
    const result = await backendRequest<unknown>("/plans", {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = learningPlanListResponseSchema.parse(result.data);
    const safe = parsed.map(toPublicLearningPlan);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}

/**
 * POST /api/plans
 *
 * CP7-dedicated handler for `POST /plans`. Creates a learning plan from
 * 1–3 queued course items (backend caps `queue_item_ids` at 3).
 *
 * Authenticated only. Browser receives only `PublicLearningPlan`
 * (camelCase view model preserving `version` for future mutations).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const parsedInput = learningPlanCreateRequestSchema.safeParse(payload);
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
    const result = await backendRequest<unknown>("/plans", {
      method: "POST",
      json: parsedInput.data,
      bearerToken: accessToken,
    });
    const parsed = learningPlanResponseSchema.parse(result.data);
    const safe = toPublicLearningPlan(parsed);
    const response = NextResponse.json(safe, { status: 201 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
