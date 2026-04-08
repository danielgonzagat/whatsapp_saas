import { createHash } from 'crypto';

/**
 * Idempotency v2 cache-key construction + body fingerprinting (P6-5, I13).
 *
 * Wave 1 P0-3 fixed a race in the idempotency interceptor but left the cache
 * key as `idempotency:${header}` — no workspace, no actor, no route, no
 * method, no body fingerprint. That meant a client (buggy or malicious) could
 * reuse the same `X-Idempotency-Key` header with a different request body and
 * the guard would return the stale cached response from the first request,
 * silently. Financial flows (withdrawal, checkout, payment confirm) were the
 * exposed surface.
 *
 * Wave 2 invariant I13 requires that:
 *
 *   Same header + different body → HTTP 409 idempotency_key_reuse_different_body
 *   Same header + same body      → return the cached response (replay-safe)
 *   Different header             → run the handler normally
 *
 * To make that verifiable, the cache key is scoped by every field that could
 * legitimately change the response: workspaceId, actorId, routeTemplate,
 * HTTP method, the idempotency header itself, and sha256(canonical body).
 * The fingerprint is also stored alongside the cached body so the guard can
 * compare on reuse.
 */

/**
 * Canonical JSON stringification: object keys sorted recursively so that
 * two structurally equivalent payloads produce the same fingerprint. Array
 * order is preserved because it is semantically meaningful. Non-JSON values
 * (Dates, Buffers, class instances) are coerced via JSON.stringify so the
 * caller sees deterministic output — if a handler accepts such types, the
 * caller should pre-serialize them into primitives.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined) // undefined fields are equivalent to missing fields
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonicalize(v)).join(',') + '}';
}

/**
 * 32-hex-char (128-bit) fingerprint of the canonical body. 128 bits is more
 * than enough entropy for collision-resistance on a per-key namespace and
 * keeps the Redis key length bounded.
 */
export function bodyFingerprint(body: unknown): string {
  return createHash('sha256').update(canonicalize(body)).digest('hex').slice(0, 32);
}

export interface IdempotencyKeyParts {
  workspaceId: string;
  actorId: string;
  routeTemplate: string;
  method: string;
  idempotencyKey: string;
  bodyFp: string;
}

/**
 * Wire-format of the v2 cache key. The `idem:v2:` prefix is the version
 * marker — if we ever need a v3 (e.g. to change the fingerprint algorithm),
 * new entries use `idem:v3:` and old entries expire via TTL without
 * corrupting the namespace.
 */
export function buildCacheKey(parts: IdempotencyKeyParts): string {
  return (
    'idem:v2:' +
    [
      parts.workspaceId || 'anon',
      parts.actorId || 'anon',
      parts.routeTemplate || 'unknown',
      parts.method || 'UNKNOWN',
      parts.idempotencyKey,
      parts.bodyFp,
    ].join(':')
  );
}

/**
 * The "scope key" is the subset of the v2 cache key that excludes the body
 * fingerprint. Two requests that share a scope key but have different body
 * fingerprints are the exact case I13 forbids — that reuse must return 409.
 *
 * The guard stores a second Redis entry keyed by the scope key that records
 * the bodyFp of the FIRST request with that scope; on subsequent requests,
 * the guard compares the new bodyFp against the stored one and throws 409
 * if they differ.
 */
export function buildScopeKey(parts: Omit<IdempotencyKeyParts, 'bodyFp'>): string {
  return (
    'idem:v2:scope:' +
    [
      parts.workspaceId || 'anon',
      parts.actorId || 'anon',
      parts.routeTemplate || 'unknown',
      parts.method || 'UNKNOWN',
      parts.idempotencyKey,
    ].join(':')
  );
}
