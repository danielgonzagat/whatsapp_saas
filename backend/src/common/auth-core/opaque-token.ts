import { createHash, randomBytes } from 'node:crypto';

/**
 * Shared opaque-token-at-rest codec for the auth-core family.
 *
 * Both the tenant auth stack and the admin auth stack independently hash
 * opaque tokens (refresh tokens, magic-link tokens, partner-invite tokens,
 * verification tokens, destructive-intent undo tokens) with an identical
 * SHA-256 hex digest before persisting them. This module is the single
 * byte-identical source for that codec so a security fix to the hashing or
 * token-generation primitive propagates to every consumer.
 *
 * Behavior contract (must stay byte-identical to the pre-extraction inline
 * implementations it replaces):
 *   - sha256Hex(input)        === createHash('sha256').update(input, 'utf8').digest('hex')
 *   - hashOpaqueToken(token)  === sha256Hex(token)   (alias kept for the existing
 *                                                      tenant call surface)
 *   - generateOpaqueToken(n)  === randomBytes(n).toString('base64url')  (default n=32)
 *
 * Node's createHash().update(string) defaults to 'utf8', so passing 'utf8'
 * explicitly here is identical to the tenant call sites that omitted it.
 *
 * This module deliberately does NOT unify the divergent storage backends
 * (admin Postgres adminLoginAttempt / adminAuditLog vs tenant Redis / AuditLog)
 * — those remain per-stack by design. Only the pure hashing/generation
 * primitive is shared.
 */

/** SHA-256 hex digest of a string. The canonical opaque-token-at-rest fingerprint. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Hash an opaque token with SHA-256 (hex) for at-rest storage.
 *
 * Only the hash is persisted; the plaintext token is delivered to the holder
 * once and never stored. Alias of {@link sha256Hex} kept for the existing
 * tenant call surface.
 */
export function hashOpaqueToken(token: string): string {
  return sha256Hex(token);
}

/** Generate an opaque base64url-encoded token (no padding). Default 32 bytes → 43 chars. */
export function generateOpaqueToken(size = 32): string {
  return randomBytes(size).toString('base64url');
}
