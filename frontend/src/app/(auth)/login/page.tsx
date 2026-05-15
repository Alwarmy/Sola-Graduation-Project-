import { Suspense } from "react";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/AuthCard";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata = {
  title: "Sign in · SOLA",
};

// LoginForm reads `useSearchParams()` (for the `registered` flag). Wrap in
// Suspense so Next.js can statically prepare the shell while the search
// params hydrate on the client.
export default function LoginPage() {
  return (
    <AuthCard
      title="Sign in"
      subtitle="Use your SOLA account to continue."
      footer={
        <>
          New to SOLA? <Link href="/register">Create an account</Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
