/**
 * Typed shape of the runtime handshake report.
 *
 * Produced by `backendHandshake()` in `lib/runtime/backend-handshake.ts`.
 * This type is browser-safe so future developer-diagnostics surfaces can
 * import the shape without pulling server-only modules. The producer is
 * server-only.
 */

export type ProbeOutcome =
  | { kind: "ok"; status: number; requestId: string | undefined; summary?: string }
  | { kind: "error"; status?: number; message: string; requestId?: string };

export type RuntimeReport = {
  generatedAt: string;
  backendUrl: string;
  rootProbe: ProbeOutcome;
  healthDbProbe: ProbeOutcome;
  openapiProbe: ProbeOutcome & {
    title?: string;
    version?: string;
    operationCount?: number;
  };
};
