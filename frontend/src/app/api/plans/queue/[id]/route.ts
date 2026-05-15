import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  scheduleQueueAddRequestSchema,
  scheduleQueueItemResponseSchema,
  toPublicQueueItem,
} from "@/lib/contracts/plans";

/**
 * CP7-dedicated queue handler at `/api/plans/queue/[id]`.
 *
 * Two methods on one path because backend uses two routes that share the
 * `{X}` path-param shape under `/plans/queue/{X}` (different X semantics):
 *
 *   - POST   /plans/queue/{course_id}    — add a course to the queue.
 *           Body: ScheduleQueueAddRequest `{ note?: string|null }`.
 *           Response: 201 ScheduleQueueItemResponse → PublicQueueItem.
 *
 *   - DELETE /plans/queue/{queue_item_id} — remove a queue item.
 *           No body. Backend returns 2xx.
 *
 * Authenticated only. Backend bearer is read from the HttpOnly access
 * cookie server-side. No token ever reaches browser code.
 */

function unauthorized(): NextResponse {
  return NextResponse.json(
    { detail: "Not authenticated", error_code: "not_authenticated" },
    { status: 401 },
  );
}

function requireId(id: string | undefined): NextResponse | string {
  const trimmed = (id ?? "").trim();
  if (trimmed.length === 0) {
    return NextResponse.json(
      { detail: "Identifier is required.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }
  return trimmed;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const idOrError = requireId(id);
  if (idOrError instanceof NextResponse) return idOrError;
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) return unauthorized();

  let payload: unknown = {};
  try {
    const text = await request.text();
    if (text.length > 0) payload = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }
  const parsedInput = scheduleQueueAddRequestSchema.safeParse(payload ?? {});
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
    const result = await backendRequest<unknown>(
      `/plans/queue/${encodeURIComponent(idOrError)}`,
      {
        method: "POST",
        json: parsedInput.data,
        bearerToken: accessToken,
      },
    );
    const parsed = scheduleQueueItemResponseSchema.parse(result.data);
    const safe = toPublicQueueItem(parsed);
    const response = NextResponse.json(safe, { status: 201 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const idOrError = requireId(id);
  if (idOrError instanceof NextResponse) return idOrError;
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) return unauthorized();

  try {
    const result = await backendRequest<unknown>(
      `/plans/queue/${encodeURIComponent(idOrError)}`,
      { method: "DELETE", bearerToken: accessToken },
    );
    const response = NextResponse.json({ ok: true }, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
