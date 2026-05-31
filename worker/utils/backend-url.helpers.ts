/**
 * Shared backend-base-URL resolver consolidating the duplicate copies that
 * previously lived in `worker/providers/mind-client.ts`,
 * `worker/providers/unified-agent-integrator.ts`, and `worker/pulse-runtime.ts`.
 *
 * Pure: only reads `process.env` and normalizes the string. No I/O, no logger,
 * no side effects at import time. Safe to import from any worker module.
 *
 * Resolution order (first non-empty wins, preserving prior behavior):
 *   1. `BACKEND_URL`
 *   2. `API_URL`
 *   3. `SERVICE_BASE_URL`
 *
 * The result has trailing slashes trimmed. Returns `null` when no env var is
 * set so callers can short-circuit with an honest "backend not configured"
 * state instead of building a malformed URL.
 *
 * Note: `worker/voice-processor.ts` uses a slightly different resolver that
 * also accepts `BACKEND_PUBLIC_URL` and falls back to `http://localhost:3001`.
 * That variant intentionally remains local because its semantics (public-facing
 * URL with dev default) differ from the internal service-discovery resolver
 * implemented here. Do NOT collapse them without an ADR — they have different
 * intent.
 */

const TRAILING_SLASHES_RE = /\/+$/;

/**
 * Resolve the configured worker→backend base URL from environment variables.
 *
 * @returns Normalized URL with trailing slashes stripped, or `null` when none
 *   of the supported env vars are set.
 */
export function resolveBackendUrl(): string | null {
  const configured =
    process.env.BACKEND_URL || process.env.API_URL || process.env.SERVICE_BASE_URL || '';
  const normalized = configured.trim().replace(TRAILING_SLASHES_RE, '');
  return normalized || null;
}
