import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React 19 + RTL 16 + Vitest: make sure tests are recognized as an `act`
// environment so concurrent rendering flushes synchronously inside tests.
// RTL normally sets this, but doing it explicitly in setup avoids races.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
