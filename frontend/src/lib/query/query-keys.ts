/**
 * Typed query key factory.
 *
 * CP2 establishes the key namespace before any feature hooks land. The
 * factory is intentionally library-agnostic — it returns plain arrays —
 * because React Query is not installed yet (it arrives with the first
 * feature hook in CP3 or CP4). When it lands, hooks can pass these keys
 * straight to `useQuery({ queryKey: queryKeys.auth.session(), ... })`.
 *
 * Conventions:
 *   - Top-level namespace is the backend domain (`auth`, `courses`, ...).
 *   - Concrete keys are functions, even when they take no arguments, so
 *     they read consistently at call sites: `queryKeys.auth.session()`.
 *   - Parameter shape mirrors backend route shape. Pass parameters
 *     positionally where there is one canonical param; pass objects when
 *     there are multiple optional filters (e.g. courses.search).
 *
 * Source for key names: mutation-invalidation table in the backend
 * reference §5 (`docs/01_canonical_backend_reference/...` §5).
 */

export const queryKeys = {
  auth: {
    session: () => ["auth", "session"] as const,
    user: () => ["auth", "user"] as const,
  },
  profile: {
    me: () => ["profile", "me"] as const,
  },
  courses: {
    catalog: (params: object) => ["courses", "catalog", params] as const,
    search: (params: object) => ["courses", "search", params] as const,
    detail: (courseId: number | string) => ["courses", "detail", courseId] as const,
  },
  courseStructures: {
    detail: (courseId: number | string) => ["courseStructures", "detail", courseId] as const,
    units: (courseId: number | string) => ["courseStructures", "units", courseId] as const,
  },
  recommendations: {
    list: () => ["recommendations"] as const,
  },
  plans: {
    list: () => ["plans", "list"] as const,
    active: () => ["plans", "active"] as const,
    queue: () => ["plans", "queue"] as const,
    detail: (planId: number | string) => ["plans", "detail", planId] as const,
    readiness: (planId: number | string) => ["plans", "readiness", planId] as const,
    items: (planId: number | string) => ["plans", "items", planId] as const,
    executionSummary: (planId: number | string) =>
      ["plans", "executionSummary", planId] as const,
    recoveryPreview: (planId: number | string) => ["plans", "recoveryPreview", planId] as const,
  },
  assistant: {
    conversations: () => ["assistant", "conversations"] as const,
    conversation: (conversationId: number | string) =>
      ["assistant", "conversation", conversationId] as const,
    messages: (conversationId: number | string) =>
      ["assistant", "messages", conversationId] as const,
    memorySignals: (filters: object) =>
      ["assistant", "memorySignals", filters] as const,
    actionRuns: (filters: object) => ["assistant", "actionRuns", filters] as const,
  },
  learningState: {
    current: () => ["learningState", "current"] as const,
  },
  events: {
    list: (filters: object) => ["events", "list", filters] as const,
  },
  home: {
    composition: () => ["home", "composition"] as const,
  },
} as const;

export type QueryKey = ReturnType<
  | typeof queryKeys.auth.session
  | typeof queryKeys.auth.user
  | typeof queryKeys.profile.me
  | typeof queryKeys.courses.catalog
  | typeof queryKeys.courses.search
  | typeof queryKeys.courses.detail
  | typeof queryKeys.courseStructures.detail
  | typeof queryKeys.courseStructures.units
  | typeof queryKeys.recommendations.list
  | typeof queryKeys.plans.list
  | typeof queryKeys.plans.active
  | typeof queryKeys.plans.queue
  | typeof queryKeys.plans.detail
  | typeof queryKeys.plans.readiness
  | typeof queryKeys.plans.items
  | typeof queryKeys.plans.executionSummary
  | typeof queryKeys.plans.recoveryPreview
  | typeof queryKeys.assistant.conversations
  | typeof queryKeys.assistant.conversation
  | typeof queryKeys.assistant.messages
  | typeof queryKeys.assistant.memorySignals
  | typeof queryKeys.assistant.actionRuns
  | typeof queryKeys.learningState.current
  | typeof queryKeys.events.list
  | typeof queryKeys.home.composition
>;
