"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { ErrorState } from "@/components/states/ErrorState";
import { ValidationErrors } from "@/components/states/ValidationErrors";
import { useRegister } from "@/features/auth/hooks/useRegister";
import { BackendError } from "@/lib/errors/backend-error";
import { userRegisterSchema } from "@/lib/contracts/auth";

/**
 * Register form.
 *
 * - Same client-side Zod gate as login.
 * - On success, routes to `/login?registered=1`. **No auto-login**.
 * - 422 field errors via `ValidationErrors`; global errors via `ErrorState`.
 */
export function RegisterForm() {
  const router = useRouter();
  const register = useRegister();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [localErrors, setLocalErrors] = useState<{
    email?: string;
    full_name?: string;
    password?: string;
  }>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalErrors({});
    const parsed = userRegisterSchema.safeParse({
      email,
      full_name: fullName,
      password,
    });
    if (!parsed.success) {
      const errs: { email?: string; full_name?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" && !errs.email) errs.email = issue.message;
        if (key === "full_name" && !errs.full_name) errs.full_name = issue.message;
        if (key === "password" && !errs.password) errs.password = issue.message;
      }
      setLocalErrors(errs);
      return;
    }
    register.mutate(parsed.data, {
      onSuccess: () => router.push("/login?registered=1"),
    });
  }

  const backendError = register.error instanceof BackendError ? register.error : null;
  const isValidationError = backendError?.errorCode === "request_validation_error";

  return (
    <form onSubmit={onSubmit} noValidate>
      {register.error && !isValidationError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ErrorState error={register.error} />
        </div>
      ) : null}

      {isValidationError && backendError ? (
        <div style={{ marginBottom: "1rem" }}>
          <ValidationErrors source={backendError} />
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        <FormField label="Full name" error={localErrors.full_name} required>
          {(api) => (
            <Input
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              {...api}
            />
          )}
        </FormField>
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
        <FormField
          label="Password"
          hint="At least 6 characters."
          error={localErrors.password}
          required
        >
          {(api) => (
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              {...api}
            />
          )}
        </FormField>
        <Button type="submit" isBusy={register.isPending}>
          {register.isPending ? "Creating account…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
