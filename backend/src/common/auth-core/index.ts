/**
 * auth-core — shared, byte-identical primitives consumed by BOTH the tenant
 * auth stack and the admin auth stack.
 *
 * Joins the already-landed shared primitives:
 *   - common/totp.ts            (TOTP / MFA — already hoisted)
 *   - admin/common/admin-crypto (admin MFA AES + sha256Hex — already shared)
 *
 * Only pure, storage-agnostic primitives belong here. The divergent storage
 * backends (admin Postgres throttle/audit vs tenant Redis/AuditLog) stay
 * per-stack by design.
 */
export { sha256Hex, hashOpaqueToken, generateOpaqueToken } from './opaque-token';
