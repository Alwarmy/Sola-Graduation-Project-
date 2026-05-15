/**
 * Browser-safe representation of the current learner session.
 *
 * This is the ONLY auth-related type that may cross into client components.
 * It deliberately omits `access_token`, `refresh_token`, and `session_id`
 * — tokens live in HttpOnly cookies, server-side only.
 *
 * `null` user = unauthenticated visitor.
 */
export type PublicSession = {
  user: PublicUser | null;
};

export type PublicUser = {
  id: number;
  email: string;
  fullName: string;
};

export const ANONYMOUS_SESSION: PublicSession = { user: null };
