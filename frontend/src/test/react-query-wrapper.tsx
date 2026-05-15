import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Test wrapper that provides a fresh, retry-free QueryClient per render.
 * Use as `render(<Form />, { wrapper: makeQueryWrapper() })`.
 */
export function makeQueryWrapper(): React.ComponentType<{ children: ReactNode }> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
