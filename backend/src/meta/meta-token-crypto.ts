import { encryptString, safeDecrypt } from '../lib/crypto';

export function resolveMetaConnectionEncryptionKey() {
  return String(process.env.ENCRYPTION_KEY || process.env.PROVIDER_SECRET_KEY || '').trim();
}

export function encryptMetaConnectionToken(value?: string | null) {
  const token = String(value || '').trim();
  if (!token) return token;

  const key = resolveMetaConnectionEncryptionKey();
  if (!key) return token;

  return encryptString(token, key);
}

export function decryptMetaConnectionToken(value?: string | null) {
  const token = String(value || '').trim();
  if (!token) return token;

  const key = resolveMetaConnectionEncryptionKey();
  if (!key) return token;

  return safeDecrypt(token, key);
}
