import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  assistantActionRunResponseSchema,
  toPublicAssistantActionRun,
} from "@/lib/contracts/assistant";

/**
 * POST /api/assistant/action-runs/[actionRunId]/confirm
 *
 * CP9-dedicated handler for `POST /assistant/action-runs/{action_run_id}/confirm`.
 * Backend confirmation endpoint takes NO body. Returns the updated
 * action run. The adapter strips `request_payload` / `preview_payload`
 * / `result_payload` and humanizes `action_type` + `status` +
 * `failure_reason` so the browser never sees raw backend payloads.
 *
 * NOTE: This handler does NOT directly invoke any plan / course /
 * schedule mutation. The backend service owns the side-effects. The
 * frontend hook reacts to the returned `action_type` and refetches the
 * affected domain (see `useConfirmAssistantActionRun`).
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ actionRunId: string }> },
): Promise<NextResponse> {
  const { actionRunId } = await ctx.params;
  const trimmed = (actionRunId ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    return NextResponse.json(
      { detail: "Action run id is required.", error_code: "request_validation_error" },
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
      `/assistant/action-runs/${encodeURIComponent(trimmed)}/confirm`,
      {
        method: "POST",
        bearerToken: accessToken,
      },
    );
    const parsed = assistantActionRunResponseSchema.parse(result.data);
    const safe = toPublicAssistantActionRun(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
