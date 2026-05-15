import Link from "next/link";

import { AuthCard } from "@/features/auth/components/AuthCard";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export const metadata = {
  title: "Create account · SOLA",
};

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Once your account is created, please sign in."
      footer={
        <>
          Already have an account? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
