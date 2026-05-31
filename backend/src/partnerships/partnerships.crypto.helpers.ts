import { createHash, randomBytes } from 'node:crypto';

/**
 * Generates an opaque base64url-encoded token suitable for partner invites.
 *
 * Pure crypto helper extracted from PartnershipsService to keep the service
 * thin and to enable direct unit-testing without instantiating the Nest module.
 */
export function generateOpaqueToken(size = 32) {
  return randomBytes(size).toString('base64url');
}

/**
 * Hashes an opaque token with SHA-256 (hex) for at-rest storage.
 *
 * The hash is the only thing persisted; the plaintext token is delivered to
 * the partner once via email and never stored.
 */
export function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
