import "server-only";

/**
 * Cookie names and options for the SOLA Auth Gateway.
 *
 * Tokens never reach the browser. They live in HttpOnly cookies set by
 * server-side route handlers in `app/api/auth/...`. The browser only ever
 * sees `PublicSession` (see `lib/auth/session.ts`).
 *
 * - `sola_access`  — backend access_token. Short-lived.
 * - `sola_refresh` — backend refresh_token. Longer-lived. Used to call
 *                    POST /auth/refresh (in JSON body) and POST /auth/logout
 *                    (in JSON body). MUST be readable only on the server.
 * - `sola_session` — opaque backend session_id. Used to identify the active
 *                    backend session, not for direct auth. Also HttpOnly so
 *                    no client script can read it.
 */
export const ACCESS_TOKEN_COOKIE = "sola_access";
export const REFRESH_TOKEN_COOKIE = "sola_refresh";
export const SESSION_ID_COOKIE = "sola_session";

export type AuthCookieName =
  | typeof ACCESS_TOKEN_COOKIE
  | typeof REFRESH_TOKEN_COOKIE
  | typeof SESSION_ID_COOKIE;

export type AuthCookieOptions = {
  httpOnly: true;
  sameSite: "lax" | "strict";
  secure: boolean;
  path: string;
  maxAge: number;
};

/** Default cookie options for the auth boundary. `secure` follows the env. */
export function authCookieOptions(maxAgeSeconds: number): AuthCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
