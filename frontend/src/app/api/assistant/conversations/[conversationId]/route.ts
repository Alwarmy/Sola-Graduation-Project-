import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  assistantConversationDetailResponseSchema,
  toPublicAssistantConversationDetail,
} from "@/lib/contracts/assistant";

/**
 * GET /api/assistant/conversations/[conversationId]
 *
 * CP9 runtime-closure-pass dedicated handler. Server-side adapt to
 * `PublicAssistantConversationDetail` so the response body never carries
 * `conversation_metadata`, nested `message_metadata` / `context_snapshot`,
 * `signal_value` / `signal_metadata`, `request_payload` / `preview_payload`
 * / `result_payload`, `contract_summary` / `lifecycle_summary` internal
 * dicts. (Runtime audit saw those fields leak from `/api/sola/...` raw
 * passthrough.)
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> },
): Promise<NextResponse> {
  const { conversationId } = await ctx.params;
  const trimmed = (conversationId ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    return NextResponse.json(
      { detail: "Conversation id is required.", error_code: "request_validation_error" },
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
      `/assistant/conversations/${encodeURIComponent(trimmed)}`,
      { method: "GET", bearerToken: accessToken },
    );
    const parsed = assistantConversationDetailResponseSchema.parse(result.data);
    const safe = toPublicAssistantConversationDetail(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
