import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  assistantMemorySignalResponseSchema,
  toPublicAssistantMemorySignal,
} from "@/lib/contracts/assistant";

const memoryListSchema = z.array(assistantMemorySignalResponseSchema);

/**
 * GET /api/assistant/memory-signals
 *
 * CP9 runtime-closure-pass dedicated handler. Adapts via
 * `toPublicAssistantMemorySignal` server-side so the response body strips
 * `signal_value` and `signal_metadata` dicts before the browser sees them.
 * Forwards optional `status_filter` / `effective_only` / `conversation_id`
 * query params.
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
  const statusFilter = url.searchParams.get("status_filter")?.trim();
  if (statusFilter) params.set("status_filter", statusFilter);
  if (url.searchParams.get("effective_only") === "true") params.set("effective_only", "true");
  const convId = url.searchParams.get("conversation_id")?.trim();
  if (convId && /^[1-9][0-9]*$/.test(convId)) params.set("conversation_id", convId);
  const qs = params.toString();
  try {
    const result = await backendRequest<unknown>(
      `/assistant/memory-signals${qs ? `?${qs}` : ""}`,
      { method: "GET", bearerToken: accessToken },
    );
    const parsed = memoryListSchema.parse(result.data);
    const safe = parsed.map(toPublicAssistantMemorySignal);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
