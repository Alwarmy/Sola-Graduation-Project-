import { NextResponse, type NextRequest } from "next/server";

import { backendRequest } from "@/lib/api/http";
import { userRegisterSchema, userResponseSchema } from "@/lib/contracts/auth";
import { backendErrorResponse } from "@/lib/auth/safe-error-response";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * POST /api/auth/register
 *
 * 1. Validate `{ email, full_name, password }` from the client.
 * 2. Call backend POST /auth/register.
 * 3. Validate UserResponse.
 * 4. Return `{ user: { id, email, fullName } }`.
 *
 * NEVER sets auth cookies. Never auto-logs-in. Per CP1 evidence and the
 * locked product decision, register success directs the user back to /login.
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

  const parsedInput = userRegisterSchema.safeParse(payload);
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
    const result = await backendRequest<unknown>("/auth/register", {
      method: "POST",
      json: parsedInput.data,
    });
    const user = userResponseSchema.parse(result.data);
    const body = {
      user: { id: user.id, email: user.email, fullName: user.full_name },
    };
    const response = NextResponse.json(body, { status: 201 });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
    if (err instanceof BackendError) return backendErrorResponse(err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 502 });
  }
}
