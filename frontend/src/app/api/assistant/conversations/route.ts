import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  assistantConversationCreateRequestSchema,
  assistantConversationResponseSchema,
  toPublicAssistantConversation,
} from "@/lib/contracts/assistant";

const conversationListSchema = z.array(assistantConversationResponseSchema);

/**
 * GET /api/assistant/conversations
 *
 * CP9 runtime-closure-pass dedicated handler. Originally the conversations
 * list was read through the `/api/sola/[...path]` catch-all and adapted
 * in the React Query hook (`useAssistantConversations`). Runtime audit
 * showed that approach leaked `conversation_metadata` / `user_id` in the
 * raw network response even though the DOM never rendered them. This
 * dedicated GET runs the adapter server-side so the browser-visible
 * response body contains ONLY the `PublicAssistantConversation` shape.
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
    const result = await backendRequest<unknown>("/assistant/conversations", {
      method: "GET",
      bearerToken: accessToken,
    });
    const parsed = conversationListSchema.parse(result.data);
    const safe = parsed.map(toPublicAssistantConversation);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}

/**
 * POST /api/assistant/conversations
 *
 * CP9-dedicated handler for `POST /assistant/conversations`. Validates the
 * optional title client-side, forwards via `backendRequest`, adapts the
 * response to `PublicAssistantConversation` so the browser never sees
 * `user_id` / `conversation_metadata` / other internal fields.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const accessToken = await readAccessTokenCookie();
  if (!accessToken) {
    return NextResponse.json(
      { detail: "Not authenticated", error_code: "not_authenticated" },
      { status: 401 },
    );
  }

  let payload: unknown = {};
  try {
    const text = await request.text();
    payload = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }
  const parsedInput = assistantConversationCreateRequestSchema.safeParse(payload);
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
    const body =
      parsedInput.data.title != null && parsedInput.data.title.length > 0
        ? { title: parsedInput.data.title }
        : {};
    const result = await backendRequest<unknown>("/assistant/conversations", {
      method: "POST",
      json: body,
      bearerToken: accessToken,
    });
    const parsed = assistantConversationResponseSchema.parse(result.data);
    const safe = toPublicAssistantConversation(parsed);
    const response = NextResponse.json(safe, { status: 201 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
