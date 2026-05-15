import type { ReactNode } from "react";

/**
 * (app) route group: authenticated app surfaces. Layout is minimal; the
 * root layout already supplies `<Providers>` and the global page chrome.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
