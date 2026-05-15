import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  assistantMemorySignalResponseSchema,
  toPublicAssistantMemorySignal,
} from "@/lib/contracts/assistant";

/**
 * POST /api/assistant/memory-signals/[signalId]/confirm
 *
 * CP9-dedicated handler for `POST /assistant/memory-signals/{signal_id}/confirm`.
 * Backend confirmation endpoint takes NO body. Returns the updated signal.
 * The adapter strips `signal_value` and `signal_metadata` so the browser
 * never sees the raw payload, only the safe summary + labels.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ signalId: string }> },
): Promise<NextResponse> {
  const { signalId } = await ctx.params;
  const trimmed = (signalId ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    return NextResponse.json(
      { detail: "Memory signal id is required.", error_code: "request_validation_error" },
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
      `/assistant/memory-signals/${encodeURIComponent(trimmed)}/confirm`,
      {
        method: "POST",
        bearerToken: accessToken,
      },
    );
    const parsed = assistantMemorySignalResponseSchema.parse(result.data);
    const safe = toPublicAssistantMemorySignal(parsed);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
