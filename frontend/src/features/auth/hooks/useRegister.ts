"use client";

import { useMutation } from "@tanstack/react-query";

import { authFetch } from "@/features/auth/api/client";
import type { UserRegister, UserResponse } from "@/lib/contracts/auth";

export type RegisterResult = {
  user: { id: number; email: string; fullName: string };
};

/**
 * Register mutation.
 *
 * Returns the safe `{ user }` shape from /api/auth/register. NEVER touches
 * session queries — register success does not authenticate the user; the
 * UI routes to /login after success.
 */
export function useRegister() {
  return useMutation<RegisterResult, Error, UserRegister>({
    mutationFn: (input) =>
      authFetch<RegisterResult>("/api/auth/register", { method: "POST", json: input }),
  });
}

// Re-exported for callers that import the schema-derived type alongside.
export type { UserResponse };
