/**
 * SOLA Frontend — source locks (Block 1).
 *
 * These are project-wide invariants enforced through code review, not runtime
 * checks. They are encoded here so any contributor opening the repo sees the
 * non-negotiable rules before writing a single line of product code.
 *
 * Authority order (mirrors docs/04_block1_execution_plan_v2):
 *   1. Explicit current user decisions
 *   2. Backend source behavior (read-only)
 *   3. SOLA_Frontend_Block_1_Execution_Plan_v2_MAXIMUM_READINESS_FINAL.md
 *   4. SOLA_Backend_Deep_Frontend_Reference_v3_1_EXECUTION_READY_FINAL.md
 *   5. SOLA_Backend_Frontend_Machine_Matrix_v4_FINAL_EXECUTION_READINESS
 *   6. SOLA_Frontend_Build_Gate_Checklist_v2_MAXIMUM_CONTROL_FINAL.md
 */

export const SOURCE_LOCKS = {
  backendReadOnly: {
    path: "backend/",
    rule: "Backend code must never be modified, renamed, formatted, or generated against. It is read-only implementation truth.",
  },
  noOldFrontend: {
    rule: "There is no old frontend to reuse. No copied pages, components, hooks, fixtures, or fake dashboards.",
  },
  noFakeProductTruth: {
    rule: "Every visible product value must come from the backend or from an honest loading/empty/error state. No localStorage as product truth, no mock data in production code.",
  },
  userSafeCopy: {
    rule: "Never render raw backend strings: no snake_case, raw enums, null/undefined/NaN, ingestion/admin terms, or provider-internal details.",
  },
  authGateway: {
    rule: "Auth uses a frontend Auth Gateway with session-based behavior. Prefer HttpOnly cookies. Register success goes to login; no auto-login unless backend explicitly returns an authenticated session.",
    implementedIn: "CP4",
  },
  courseSearchPipeline: {
    rule: "Learner course search: input → POST /courses/ingest, output → GET /courses/search. Only curated search results are rendered. No raw ingestion records, no admin pipeline UI.",
    implementedIn: "CP6",
  },
  assistantSemantics: {
    rule: "Assistant is conversations + messages + memory signals + action runs + governance + cross-domain effects. Actions are suggested then user-confirmed via backend confirm routes. After confirmation, affected data is refetched.",
    implementedIn: "CP9",
  },
  apiOnlyIsIncomplete: {
    rule: "A learner-facing route is incomplete if it only has an API method. It requires contract, gateway access, adapter, hook, surface, states, labels, errors, and runtime evidence.",
  },
  backendBugsNotFrontendBugs: {
    rule: "If backend returns a surprising result, display it truthfully and document the concern separately. Frontend must not correct backend business logic.",
  },
} as const;

export type SourceLockKey = keyof typeof SOURCE_LOCKS;
