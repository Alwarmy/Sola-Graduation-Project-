import "server-only";

import { z } from "zod";

/**
 * Backend `Token` envelope (`POST /auth/login`, `POST /auth/refresh`).
 *
 * Server-only. The browser must never receive these fields directly — the
 * Auth Gateway stores them in HttpOnly cookies. See `lib/auth/cookies.ts`.
 *
 * Mirrors the OpenAPI schema captured in CP1:
 *   docs/runtime/B1_CP1_openapi_snapshot.json#/components/schemas/Token
 */
export const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string().default("bearer"),
  access_token_expires_in_seconds: z.number().int().nonnegative(),
  refresh_token_expires_in_seconds: z.number().int().nonnegative(),
  session_id: z.string(),
});

export type BackendToken = z.infer<typeof tokenSchema>;
