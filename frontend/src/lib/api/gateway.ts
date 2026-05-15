import "server-only";

import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { backendRequest, type BackendRequestInit, type BackendResponse } from "@/lib/api/http";
import { BackendError } from "@/lib/errors/backend-error";

/**
 * Server-only gateway for authenticated backend calls.
 *
 * The Auth Gateway is the only place the access token from the HttpOnly
 * cookie is read and attached to a backend request. Browser code never has
 * access to it. Concrete UI/route handlers compose `gatewayRequest` rather
 * than calling `backendRequest` directly.
 *
 * Modes:
 *   - "required" (default for protected calls): if there is no access token
 *     cookie, throws a synthetic 401 `BackendError` so callers can route
 *     learners back to /login without contacting the backend.
 *   - "optional": forwards the bearer if present, otherwise calls the
 *     backend anonymously. Used for `GET /courses/search`, which the
 *     backend reference + CP1 runtime probe both confirm accepts no-token.
 */
export type GatewayAuthMode = "required" | "optional";

export type GatewayRequestInit = Omit<BackendRequestInit, "bearerToken"> & {
  authMode?: GatewayAuthMode;
};

export async function gatewayRequest<T = unknown>(
  path: string,
  init: GatewayRequestInit = {},
): Promise<BackendResponse<T>> {
  const { authMode = "required", ...rest } = init;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;

  if (authMode === "required" && !accessToken) {
    throw new BackendError({
      status: 401,
      detail: "Not authenticated",
      errorCode: "not_authenticated",
    });
  }

  return backendRequest<T>(path, {
    ...rest,
    bearerToken: accessToken,
  });
}
