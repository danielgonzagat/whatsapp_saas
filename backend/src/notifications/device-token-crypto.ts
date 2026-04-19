import { encryptString, safeDecrypt } from '../lib/crypto';
import { hashAuthToken } from '../auth/auth-token-hash';

function resolveDeviceTokenEncryptionKey() {
  return String(process.env.ENCRYPTION_KEY || process.env.PROVIDER_SECRET_KEY || '').trim();
}

export function hashDeviceToken(token?: string | null) {
  return hashAuthToken(String(token || '').trim());
}

export function decryptDeviceToken(value?: string | null) {
  const token = String(value || '').trim();
  if (!token) return token;

  const key = resolveDeviceTokenEncryptionKey();
  if (!key) return token;

  return safeDecrypt(token, key);
}

export function encryptDeviceToken(value?: string | null) {
  const token = decryptDeviceToken(value);
  if (!token) return token;

  const key = resolveDeviceTokenEncryptionKey();
  if (!key) return token;

  return encryptString(token, key);
}
