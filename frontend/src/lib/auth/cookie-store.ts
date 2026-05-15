import "server-only";

import { cookies } from "next/headers";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  SESSION_ID_COOKIE,
  authCookieOptions,
} from "@/lib/auth/cookies";
import type { BackendToken } from "@/lib/auth/tokens";

/**
 * Server-only cookie store for the Auth Gateway.
 *
 * Tokens leave the route handler through `cookies().set(...)` ONLY. They are
 * never serialized into JSON responses. Browser code can therefore never read
 * the access or refresh token directly — only the `PublicSession` shape we
 * return from `/api/auth/*`.
 *
 * The session_id cookie is also HttpOnly. The browser cannot read it directly;
 * a future CP may surface a non-sensitive "I appear logged in" hint via a
 * server response, but this module never exposes the value itself.
 */

export async function writeTokenCookies(token: BackendToken): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: ACCESS_TOKEN_COOKIE,
    value: token.access_token,
    ...authCookieOptions(token.access_token_expires_in_seconds),
  });
  jar.set({
    name: REFRESH_TOKEN_COOKIE,
    value: token.refresh_token,
    ...authCookieOptions(token.refresh_token_expires_in_seconds),
  });
  jar.set({
    name: SESSION_ID_COOKIE,
    value: token.session_id,
    ...authCookieOptions(token.refresh_token_expires_in_seconds),
  });
}

/**
 * Clear all three auth cookies. Used by logout, by 401 on refresh, and
 * defensively by any handler that detects a session is no longer valid.
 *
 * We set both `maxAge: 0` (via `authCookieOptions(0)`) so the cookie expires
 * immediately. Browsers also accept `cookies().delete(name)`, but using `set`
 * with maxAge=0 guarantees the same `Path`/`SameSite`/`Secure` matches as the
 * cookies we originally wrote.
 */
export async function clearTokenCookies(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, SESSION_ID_COOKIE]) {
    jar.set({
      name,
      value: "",
      ...authCookieOptions(0),
    });
  }
}

/** Server-only read of the refresh token cookie. */
export async function readRefreshTokenCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(REFRESH_TOKEN_COOKIE)?.value;
}

/** Server-only read of the access token cookie. */
export async function readAccessTokenCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(ACCESS_TOKEN_COOKIE)?.value;
}
