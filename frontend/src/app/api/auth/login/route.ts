import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { userLoginSchema, userResponseSchema } from "@/lib/contracts/auth";
import { tokenSchema } from "@/lib/auth/tokens";
import { writeTokenCookies } from "@/lib/auth/cookie-store";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import type { PublicSession } from "@/lib/auth/session";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * POST /api/auth/login
 *
 * 1. Validate `{ email, password }` from the client.
 * 2. Call backend POST /auth/login.
 * 3. Validate the returned Token shape against the locked schema.
 * 4. Write HttpOnly cookies (access, refresh, session).
 * 5. Call backend GET /auth/me to populate the safe `PublicSession` shape.
 * 6. Return `PublicSession` — never tokens.
 *
 * On any backend error, propagate a safe `{detail, error_code?, request_id?}`
 * envelope so the client UI can pick the right intent (login, rate-limited,
 * validation, unavailable). No raw token leaks under any code path.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { detail: "Invalid request body.", error_code: "request_validation_error" },
      { status: 422 },
    );
  }

  const parsedInput = userLoginSchema.safeParse(payload);
  if (!parsedInput.success) {
    return NextResponse.json(
      {
        detail: "Request validation failed.",
        error_code: "request_validation_error",
        details: {
          errors: parsedInput.error.issues.map((i) => ({
            type: i.code,
            loc: ["body", ...i.path.map(String)],
            msg: i.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  try {
    const loginResult = await backendRequest<unknown>("/auth/login", {
      method: "POST",
      json: parsedInput.data,
    });

    const token = tokenSchema.parse(loginResult.data);
    await writeTokenCookies(token);

    // Look up the safe user shape using the access token we just got. We don't
    // read from the cookie jar here to avoid an extra `cookies()` await and
    // because we already hold the token in memory.
    const meResult = await backendRequest<unknown>("/auth/me", {
      method: "GET",
      bearerToken: token.access_token,
    });
    const user = userResponseSchema.parse(meResult.data);

    const session: PublicSession = {
      user: { id: user.id, email: user.email, fullName: user.full_name },
    };
    const response = NextResponse.json<PublicSession>(session, { status: 200 });
    if (loginResult.requestId) response.headers.set(REQUEST_ID_HEADER, loginResult.requestId);
    return response;
  } catch (err) {
    // BackendError already carries a safe envelope; any other throwable
    // (Zod parse failure on Token shape, network) becomes a generic 502.
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
