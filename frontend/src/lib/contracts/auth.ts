import { z } from "zod";

/**
 * Auth domain request/response Zod schemas.
 *
 * Mirrors `components/schemas` from the CP1 OpenAPI snapshot at
 * `docs/runtime/B1_CP1_openapi_snapshot.json`. Keep these in sync if the
 * backend contract changes; the CP1 evidence files are the source of truth
 * until CP1 is re-run.
 *
 * NOTE: response schemas here are deliberately permissive on optional
 * fields. The Auth Gateway only re-validates the inbound login token via
 * `tokenSchema` in `lib/auth/tokens.ts`; UI layers should not call these
 * routes directly from the browser.
 */

// ─── Requests ───────────────────────────────────────────────────────────────

// Safe user-facing validation copy (Pre-CP8 hardening D-1, D-6). Default Zod
// messages ("String must contain at least 6 character(s)") leak validator
// wording to the form; explicit messages keep the form copy English-safe and
// translatable.
export const userLoginSchema = z.object({
  email: z.string({ required_error: "Enter a valid email address." }).email({
    message: "Enter a valid email address.",
  }),
  password: z
    .string({ required_error: "Enter your password." })
    .min(1, { message: "Enter your password." })
    .max(128, { message: "Password is too long." }),
});
export type UserLogin = z.infer<typeof userLoginSchema>;

export const userRegisterSchema = z.object({
  email: z.string({ required_error: "Enter a valid email address." }).email({
    message: "Enter a valid email address.",
  }),
  full_name: z
    .string({ required_error: "Please enter your name." })
    .min(1, { message: "Please enter your name." })
    .max(255, { message: "Name is too long." }),
  password: z
    .string({ required_error: "Use at least 6 characters." })
    .min(6, { message: "Use at least 6 characters." })
    .max(128, { message: "Password is too long." }),
});
export type UserRegister = z.infer<typeof userRegisterSchema>;

export const refreshTokenRequestSchema = z.object({
  refresh_token: z.string().min(10).max(512),
});
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

export const logoutRequestSchema = z.object({
  refresh_token: z.string().min(10).max(512),
});
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;

// ─── Responses ──────────────────────────────────────────────────────────────

export const userResponseSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  full_name: z.string(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;

// `tokenSchema` lives in `lib/auth/tokens.ts` because it is server-only.
