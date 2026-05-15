import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  assistantMessageCreateRequestSchema,
  assistantMessageExchangeResponseSchema,
  assistantMessageResponseSchema,
  toPublicAssistantExchange,
  toPublicAssistantMessage,
} from "@/lib/contracts/assistant";

const messageListSchema = z.array(assistantMessageResponseSchema);

/**
 * GET /api/assistant/conversations/[conversationId]/messages
 *
 * CP9 runtime-closure-pass dedicated handler. Adapts each message via
 * `toPublicAssistantMessage` server-side so the response body strips
 * `message_metadata`, `context_snapshot`, and nested `governance` /
 * `artifact_summary` internals before the browser sees them.
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
      `/assistant/conversations/${encodeURIComponent(trimmed)}/messages`,
      { method: "GET", bearerToken: accessToken },
    );
    const parsed = messageListSchema.parse(result.data);
    const safe = parsed.map(toPublicAssistantMessage);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}

/**
 * POST /api/assistant/conversations/[conversationId]/messages
 *
 * CP9-dedicated handler for `POST /assistant/conversations/{id}/messages`.
 *
 * - Validates content (1..4000) via Zod before any backend call.
 * - Adapts `AssistantMessageExchangeResponse` to the safe
 *   `PublicAssistantExchange` view model:
 *     - strips `used_context_summary`, `message_metadata`, `context_snapshot`,
 *       `signal_value`, `signal_metadata`, `preview_payload`,
 *       `request_payload`, `result_payload`, raw grounded-entity metadata
 *     - maps `response_mode` + `governance` + `action_type` + memory `scope/status`
 *       through safe label tables
 * - Forwards `x-request-id` from the backend so the client can show
 *   `Ref: …` on the small subset of errors that need diagnostics.
 */
export async function POST(
  request: NextRequest,
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }
  const parsedInput = assistantMessageCreateRequestSchema.safeParse(payload);
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
      `/assistant/conversations/${encodeURIComponent(trimmed)}/messages`,
      {
        method: "POST",
        json: parsedInput.data,
        bearerToken: accessToken,
      },
    );
    const parsed = assistantMessageExchangeResponseSchema.parse(result.data);
    const safe = toPublicAssistantExchange(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
