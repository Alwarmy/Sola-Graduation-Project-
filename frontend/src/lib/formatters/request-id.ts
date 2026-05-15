/**
 * Render a backend `x-request-id` value for support diagnostics.
 *
 * NEVER use this string as a user-facing failure message; it is for
 * "share with support" copy or developer-only panels. CP3's ErrorState
 * surfaces it as a small, secondary line so users can quote it without
 * leaking the underlying detail.
 */
export function formatRequestId(requestId: string | null | undefined): string | null {
  if (typeof requestId !== "string") return null;
  const trimmed = requestId.trim();
  if (trimmed.length === 0) return null;
  // Show a short suffix to keep the badge compact: aaaa-bbbb-... → "...bbbb"
  // Full id is preserved as title for copy-paste.
  return `Ref: ${trimmed}`;
}
