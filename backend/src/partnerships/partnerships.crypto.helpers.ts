/**
 * Opaque-token crypto helpers for partner invites.
 *
 * These delegate to the shared auth-core primitive so the hashing/generation
 * surface stays byte-identical across the auth and partnerships stacks and a
 * security fix propagates to every consumer. The re-exported names keep this
 * module's public surface unchanged (still directly unit-testable without the
 * Nest module).
 *
 * - generateOpaqueToken: base64url-encoded token suitable for partner invites.
 * - hashOpaqueToken: SHA-256 (hex) at-rest hash; only the hash is persisted,
 *   the plaintext token is delivered to the partner once via email.
 */
export { generateOpaqueToken, hashOpaqueToken } from '../common/auth-core/opaque-token';
