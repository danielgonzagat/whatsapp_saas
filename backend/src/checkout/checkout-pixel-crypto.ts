import { encryptString, safeDecrypt } from '../lib/crypto';

export function resolveCheckoutPixelEncryptionKey() {
  return String(process.env.ENCRYPTION_KEY || process.env.PROVIDER_SECRET_KEY || '').trim();
}

export function decryptCheckoutPixelToken(value?: string | null) {
  const token = String(value || '').trim();
  if (!token) return token;

  const key = resolveCheckoutPixelEncryptionKey();
  if (!key) return token;

  return safeDecrypt(token, key);
}

export function encryptCheckoutPixelToken(value?: string | null) {
  const token = decryptCheckoutPixelToken(value);
  if (!token) return token;

  const key = resolveCheckoutPixelEncryptionKey();
  if (!key) return token;

  return encryptString(token, key);
}

export function maskCheckoutPixelToken(value?: string | null) {
  const token = decryptCheckoutPixelToken(value);
  if (!token) return null;

  const suffix = token.slice(-4);
  return suffix ? `****${suffix}` : '****';
}
