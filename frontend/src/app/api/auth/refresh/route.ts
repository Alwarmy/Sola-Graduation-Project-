import { NextResponse } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { tokenSchema } from "@/lib/auth/tokens";
import {
  clearTokenCookies,
  readRefreshTokenCookie,
  writeTokenCookies,
} from "@/lib/auth/cookie-store";
import { userResponseSchema } from "@/lib/contracts/auth";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import type { PublicSession } from "@/lib/auth/session";
import { ANONYMOUS_SESSION } from "@/lib/auth/session";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * POST /api/auth/refresh
 *
 * 1. Read `sola_refresh` from the HttpOnly cookie.
 * 2. Call backend POST /auth/refresh with `{ refresh_token }` as JSON body.
 * 3. Validate the new Token, rotate all three cookies, then look up the user
 *    again to return a fresh `PublicSession`.
 *
 * On 401 from the backend (invalid/expired/reused refresh token), clear all
 * three cookies and return anonymous session so the client can route to /login.
 */
export async function POST(): Promise<NextResponse> {
  const refreshToken = await readRefreshTokenCookie();
  if (!refreshToken) {
    // Nothing to refresh — return anonymous without touching the cookie jar.
    return NextResponse.json<PublicSession>(ANONYMOUS_SESSION, { status: 200 });
  }

  try {
    const refreshResult = await backendRequest<unknown>("/auth/refresh", {
      method: "POST",
      json: { refresh_token: refreshToken },
    });
    const token = tokenSchema.parse(refreshResult.data);
    await writeTokenCookies(token);

    const meResult = await backendRequest<unknown>("/auth/me", {
      method: "GET",
      bearerToken: token.access_token,
    });
    const user = userResponseSchema.parse(meResult.data);
    const session: PublicSession = {
      user: { id: user.id, email: user.email, fullName: user.full_name },
    };
    const response = NextResponse.json<PublicSession>(session, { status: 200 });
    if (refreshResult.requestId) response.headers.set(REQUEST_ID_HEADER, refreshResult.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) {
      // Stale or revoked refresh token — clear cookies and surface a safe
      // anonymous shape. The client will route to /login from there.
      if (err.status === 401 || err.status === 403) {
        await clearTokenCookies();
        return NextResponse.json<PublicSession>(ANONYMOUS_SESSION, { status: 200 });
      }
      return backendErrorResponse(err);
    }
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
