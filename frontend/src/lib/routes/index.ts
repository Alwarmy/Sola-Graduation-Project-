// Frontend route registry seed.
// CP0 establishes only the registry shape; concrete routes are added in later
// checkpoints when the matching pages and features are built.

export type RouteEntry = {
  path: string;
  requiresAuth: boolean;
  description: string;
};

export const routes = {
  root: {
    path: "/",
    requiresAuth: false,
    description: "Foundation landing page (replaced by Home composition in CP11).",
  },
} as const satisfies Record<string, RouteEntry>;

export type RouteKey = keyof typeof routes;
