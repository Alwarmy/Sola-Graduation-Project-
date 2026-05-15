import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside server contexts. Replace with
      // a no-op stub in tests so route-handler modules can be imported and
      // unit-tested. Real enforcement happens at build/runtime via Next.js.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
    // Force a single copy of React across all dependencies (including React
    // Query and React Testing Library). Without this, dedupe can produce two
    // copies which makes hooks read `useEffect` from a null React reference.
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
    restoreMocks: true,
  },
});
