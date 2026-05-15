import { NextResponse, type NextRequest } from "next/server";

import { gatewayRequest } from "@/lib/api/gateway";
import { BackendError } from "@/lib/errors/backend-error";
import { REQUEST_ID_HEADER } from "@/lib/api/headers";

/**
 * Catch-all SOLA gateway: `/api/sola/<backend-path>`.
 *
 * Forwards an authenticated request from the browser to the SOLA backend
 * after attaching the bearer from the HttpOnly access-token cookie. The
 * browser never sees the bearer. Body, query string, method, and content
 * type are forwarded transparently.
 *
 * Foundation rules:
 *   - All HTTP methods are wired but `OPTIONS`/`HEAD` are not gateway-able.
 *   - 401 from the backend is propagated as a 401 to the client with a
 *     safe envelope (no raw tokens or backend headers leak).
 *   - `x-request-id` from the backend response is preserved in the gateway
 *     response so support diagnostics keep working end-to-end.
 *   - Body parsing is delegated to the backend; this gateway treats the
 *     payload as opaque JSON or text.
 *
 * No product feature uses this gateway yet. CP4+ will route domain calls
 * through it (`/api/sola/courses/search?...`, etc.).
 */

async function forward(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
): Promise<NextResponse> {
  const { path: segments } = await params;
  const search = request.nextUrl.searchParams.toString();
  const backendPath = "/" + segments.map(encodeURIComponent).join("/") + (search ? `?${search}` : "");

  // Forward body as raw text for non-GET/DELETE methods. We do not assume
  // JSON because the backend may add multipart routes later.
  const method = request.method.toUpperCase() as
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE";
  const body =
    method === "GET" || method === "DELETE" ? undefined : await request.text();
  const contentType = request.headers.get("content-type") ?? undefined;

  try {
    const result = await gatewayRequest<unknown>(backendPath, {
      method,
      body: body !== undefined && body.length > 0 ? body : undefined,
      headers: contentType ? { "content-type": contentType } : undefined,
      authMode: "required",
    });
    const response = NextResponse.json(result.data ?? null, { status: result.status });
    if (result.requestId) response.headers.set(REQUEST_ID_HEADER, result.requestId);
    return response;
  } catch (err) {
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
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, ctx.params);
}
