/**
 * AES-256-GCM wrapper for admin MFA secrets at rest.
 *
 * Invariant I-ADMIN-3: admin_users.mfa_secret is never stored in plaintext.
 * It is encrypted with ADMIN_MFA_ENCRYPTION_KEY and decrypted only inside
 * AdminMfaService.verifyTotp / AdminMfaService.setupTotp.
 *
 * The ciphertext format stored in the DB is:
 *
 *   base64url(iv) || '.' || base64url(authTag) || '.' || base64url(ciphertext)
 *
 * All three segments are url-safe base64 so the full string is safe to pass
 * through JSON / HTTP / DB text columns without further escaping.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

function decodeKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('ADMIN_MFA_ENCRYPTION_KEY must be hex-encoded');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ADMIN_MFA_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (got ${key.length})`,
    );
  }
  return key;
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Buffer {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function encryptAdminSecret(plaintext: string, keyHex: string): string {
  const key = decodeKey(keyHex);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [toBase64Url(iv), toBase64Url(tag), toBase64Url(ct)].join('.');
}

export function decryptAdminSecret(payload: string, keyHex: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('admin secret ciphertext is malformed');
  }
  const [ivPart, tagPart, ctPart] = parts;
  const key = decodeKey(keyHex);
  const iv = fromBase64Url(ivPart);
  const tag = fromBase64Url(tagPart);
  const ct = fromBase64Url(ctPart);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * SHA-256 hex digest, used for storing refresh-token fingerprints in
 * admin_sessions.token_hash (invariant I-ADMIN-10).
 */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function generateRawRefreshToken(): string {
  return toBase64Url(randomBytes(32));
}
