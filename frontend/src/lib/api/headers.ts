/**
 * Backend HTTP header constants observed from CP1 runtime evidence and
 * canonical backend reference v3.1. Frontend modules import these names from
 * here so a future header rename in the backend can be tracked in one place.
 *
 * Sources:
 *   - docs/runtime/B1_CP1_backend_runtime_snapshot.md
 *   - SOLA_Backend_Deep_Frontend_Reference_v3_1 §4.2 (request ID),
 *     §4.5 (expected version / schedule revision)
 *   - SOLA_Frontend_Build_Gate_Checklist_v2 PROTO-001/005/006/009
 */

/** Backend attaches this on every response. CP2 fetcher preserves it. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Sent by FastAPI's OAuth2PasswordBearer on missing/invalid bearer 401s. */
export const WWW_AUTHENTICATE_HEADER = "www-authenticate";

/** Plan/queue mutations carry the expected version of the plan being mutated. */
export const EXPECTED_VERSION_HEADER = "X-Expected-Version";

/** Schedule/recovery mutations carry the expected schedule revision token. */
export const EXPECTED_SCHEDULE_REVISION_HEADER = "X-Expected-Schedule-Revision";

/** Backend default timezone (per `APP_TIMEZONE` in backend reference). */
export const APP_TIMEZONE = "Asia/Riyadh";

/** Standard Retry-After response header used on rate-limit responses. */
export const RETRY_AFTER_HEADER = "retry-after";
