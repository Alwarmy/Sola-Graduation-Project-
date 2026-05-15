import "server-only";

import { NextResponse } from "next/server";

import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * Build a Next.js response from a thrown error in a frontend auth handler.
 *
 * Rules enforced here:
 *   - Tokens are never written to the response body.
 *   - The body shape always matches what `parseBackendError` on the client
 *     side already understands: `{detail, error_code?, request_id?, details?}`.
 *   - `x-request-id` is preserved as a response header for support diagnostics.
 *   - Non-BackendError throwables are reduced to a generic 502 with no detail
 *     leak.
 */
export function backendErrorResponse(err: unknown): NextResponse {
  if (err instanceof BackendError) {
    const response = NextResponse.json(
      {
        detail: err.detail,
        error_code: err.errorCode,
        request_id: err.requestId,
        details: err.details,
      },
      { status: err.status },
    );
    if (err.requestId) response.headers.set(REQUEST_ID_HEADER, err.requestId);
    return response;
  }
  return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
}
