import { NextResponse } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { clearTokenCookies, readRefreshTokenCookie } from "@/lib/auth/cookie-store";
import { BackendError } from "@/lib/errors/backend-error";
import { ANONYMOUS_SESSION } from "@/lib/auth/session";

/**
 * POST /api/auth/logout
 *
 * 1. Best-effort: read `sola_refresh` and call backend POST /auth/logout so
 *    the backend can revoke the refresh token.
 * 2. Clear all three cookies **regardless** of whether the backend call
 *    succeeded — the user's session in this browser must end.
 * 3. Return anonymous session.
 *
 * We deliberately do not surface a backend logout failure to the user: from
 * their perspective, they clicked "Sign out" and they are now signed out.
 * Backend errors are recorded as response header `x-request-id` only.
 */
export async function POST(): Promise<NextResponse> {
  const refreshToken = await readRefreshTokenCookie();

  if (refreshToken) {
    try {
      await backendRequest<unknown>("/auth/logout", {
        method: "POST",
        json: { refresh_token: refreshToken },
      });
    } catch (err) {
      // Intentionally swallow — local logout still proceeds. Log via the
      // server console for diagnostics (no learner-visible leak).
      if (err instanceof BackendError) {
        console.warn(
          `[auth/logout] backend logout failed status=${err.status} request_id=${err.requestId ?? "n/a"} error_code=${err.errorCode ?? "n/a"}`,
        );
      } else {
        console.warn(`[auth/logout] backend logout threw: ${String(err)}`);
      }
    }
  }

  await clearTokenCookies();
  return NextResponse.json(ANONYMOUS_SESSION, { status: 200 });
}
