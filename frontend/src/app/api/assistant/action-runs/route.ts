import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  assistantActionRunResponseSchema,
  toPublicAssistantActionRun,
} from "@/lib/contracts/assistant";

const actionRunListSchema = z.array(assistantActionRunResponseSchema);

/**
 * GET /api/assistant/action-runs
 *
 * CP9 runtime-closure-pass dedicated handler. Adapts via
 * `toPublicAssistantActionRun` server-side so the response body strips
 * `request_payload`, `preview_payload`, `result_payload` dicts before the
 * browser sees them. Forwards optional `conversation_id` query param.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) {
    return NextResponse.json(
      { detail: "Not authenticated", error_code: "not_authenticated" },
      { status: 401 },
    );
  }
  const url = new URL(request.url);
  const params = new URLSearchParams();
  const convId = url.searchParams.get("conversation_id")?.trim();
  if (convId && /^[1-9][0-9]*$/.test(convId)) params.set("conversation_id", convId);
  const qs = params.toString();
  try {
    const result = await backendRequest<unknown>(
      `/assistant/action-runs${qs ? `?${qs}` : ""}`,
      { method: "GET", bearerToken: accessToken },
    );
    const parsed = actionRunListSchema.parse(result.data);
    const safe = parsed.map(toPublicAssistantActionRun);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
