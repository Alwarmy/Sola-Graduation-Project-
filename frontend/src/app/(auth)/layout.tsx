import type { ReactNode } from "react";

/**
 * Auth route group layout. Intentionally minimal: the root layout already
 * provides the `<html>`, `<body>`, global styles, and React Query provider.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
