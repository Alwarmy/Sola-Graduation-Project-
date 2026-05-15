import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { backendRequest } from "@/lib/api/http";
import { readAccessTokenCookie } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";
import {
  toPublicLearnerEvent,
  userEventResponseSchema,
} from "@/lib/contracts/events";

const eventsListSchema = z.array(userEventResponseSchema);

/**
 * GET /api/events
 *
 * CP11-dedicated handler for backend `GET /events`. Adapts each row
 * via `toPublicLearnerEvent` server-side so `event_payload` (an open
 * dict) and `user_id` are stripped. Forwards optional `event_type` /
 * `limit` (1..100) / `offset` (>=0) query params.
 *
 * **POST /events is intentionally NOT exposed** in CP11 (per directive
 * addendum §B): the backend accepts a free-form `event_type` + open
 * `event_payload` dict. A curated learner-safe action surface would
 * be required before exposing it; that work is deferred.
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
  const eventType = url.searchParams.get("event_type")?.trim();
  if (eventType) params.set("event_type", eventType);
  const limitRaw = url.searchParams.get("limit");
  if (limitRaw !== null && /^[1-9][0-9]*$/.test(limitRaw)) {
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10)));
    params.set("limit", String(limit));
  }
  const offsetRaw = url.searchParams.get("offset");
  if (offsetRaw !== null && /^[0-9]+$/.test(offsetRaw)) {
    params.set("offset", offsetRaw);
  }
  const qs = params.toString();
  try {
    const result = await backendRequest<unknown>(
      `/events${qs ? `?${qs}` : ""}`,
      { method: "GET", bearerToken: accessToken },
    );
    const parsed = eventsListSchema.parse(result.data);
    const safe = parsed.map(toPublicLearnerEvent);
    const response = NextResponse.json(safe, { status: 200 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
