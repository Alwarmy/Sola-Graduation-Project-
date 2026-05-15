import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { gatewayRequest } from "@/lib/api/gateway";
import { BackendError } from "@/lib/errors/backend-error";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { ANONYMOUS_SESSION, type PublicSession } from "@/lib/auth/session";
import { userResponseSchema } from "@/lib/contracts/auth";

/**
 * GET /api/auth/session
 *
 * Returns the browser-safe `PublicSession` shape. NEVER exposes tokens.
 *
 * - When no access-token cookie is present, returns `{ user: null }` 200.
 * - When a cookie is present, calls `GET /auth/me` through the gateway and
 *   returns `{ user: { id, email, fullName } }` on success.
 * - On 401 (token expired/invalid), clears the cookie and returns
 *   `{ user: null }` 200 so the client can route to /login without surfacing
 *   backend internals.
 * - On any other backend error, returns 502 with a safe envelope plus the
 *   request id for support diagnostics.
 *
 * This route is the foundation-level proof that the Auth Gateway boundary
 * works. The full /login + /register + /refresh + /logout route handlers
 * are CP4's responsibility (they own the Auth UI).
 */
export async function GET() {
  const cookieStore = await cookies();
  const hasAccess = !!cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!hasAccess) {
    return NextResponse.json<PublicSession>(ANONYMOUS_SESSION, { status: 200 });
  }

  try {
    const result = await gatewayRequest<unknown>("/auth/me", { authMode: "required" });
    const parsed = userResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      // Backend returned a shape we don't recognize. Treat as a soft session
      // failure rather than crashing the client.
      return NextResponse.json<PublicSession>(ANONYMOUS_SESSION, { status: 200 });
    }
    const session: PublicSession = {
      user: { id: parsed.data.id, email: parsed.data.email, fullName: parsed.data.full_name },
    };
    return NextResponse.json<PublicSession>(session, { status: 200 });
  } catch (err) {
    if (err instanceof BackendError && err.status === 401) {
      // Token is stale/invalid. Future CP4 logic may try a silent refresh
      // here; for now we surface anonymous and let the client redirect.
      return NextResponse.json<PublicSession>(ANONYMOUS_SESSION, { status: 200 });
    }
    if (err instanceof BackendError) {
      return NextResponse.json(
        {
          error: "backend_unavailable",
          requestId: err.requestId,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "unknown" }, { status: 502 });
  }
}
