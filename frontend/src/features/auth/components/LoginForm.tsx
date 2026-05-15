"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";
import { ValidationErrors } from "@/components/states/ValidationErrors";
import { useLogin } from "@/features/auth/hooks/useLogin";
import { BackendError } from "@/lib/errors/backend-error";
import { userLoginSchema } from "@/lib/contracts/auth";

/**
 * Login form.
 *
 * - Zod-validated client-side before submit (catches obvious errors without a
 *   round trip).
 * - On submit, calls `useLogin()`. On success, navigates to `/`.
 * - 422 field errors from the backend route through `ValidationErrors`.
 * - Global errors (invalid_credentials, auth_rate_limited, backend unavailable)
 *   route through `ErrorState`, which selects copy via `BackendError.intent`.
 */
export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const justRegistered = search.get("registered") === "1";

  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localErrors, setLocalErrors] = useState<{ email?: string; password?: string }>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalErrors({});
    const parsed = userLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" && !errs.email) errs.email = issue.message;
        if (key === "password" && !errs.password) errs.password = issue.message;
      }
      setLocalErrors(errs);
      return;
    }
    login.mutate(parsed.data, {
      onSuccess: () => router.push("/"),
    });
  }

  const backendError = login.error instanceof BackendError ? login.error : null;
  const isValidationError = backendError?.errorCode === "request_validation_error";
  // Pre-CP8 hardening D-6: invalid_credentials gets a login-form-scoped safe
  // copy instead of the generic intent="login" fallback ("Please sign in to
  // continue.").
  const isInvalidCredentials =
    backendError?.errorCode === "invalid_credentials" || backendError?.status === 401;
  const invalidCredentialsTitle = isInvalidCredentials
    ? "Incorrect email or password."
    : undefined;

  return (
    <form onSubmit={onSubmit} noValidate>
      {justRegistered ? (
        <p style={{ color: "#14692f", marginBottom: "1rem" }}>
          Account created. Please sign in.
        </p>
      ) : null}

      {login.error && !isValidationError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ErrorState error={login.error} title={invalidCredentialsTitle} />
        </div>
      ) : null}

      {isValidationError && backendError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ValidationErrors source={backendError} />
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        <FormField label="Email" error={localErrors.email} required>
          {(api) => (
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              {...api}
            />
          )}
        </FormField>
        <FormField label="Password" error={localErrors.password} required>
          {(api) => (
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              {...api}
            />
          )}
        </FormField>
        <Button type="submit" isBusy={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}
