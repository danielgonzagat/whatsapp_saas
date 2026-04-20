import { encryptString, safeDecrypt } from '../lib/crypto';

function resolveMetaTokenKey(): string | null {
  const key =
    String(process.env.ENCRYPTION_KEY || '').trim() ||
    String(process.env.PROVIDER_SECRET_KEY || '').trim() ||
    String(process.env.JWT_SECRET || '').trim();

  return key || null;
}

/** Encrypt meta token. */
export function encryptMetaToken(token: string | null | undefined): string | null | undefined {
  if (!token) {
    return token;
  }

  const key = resolveMetaTokenKey();
  if (!key) {
    return token;
  }

  return encryptString(token, key);
}

/** Decrypt meta token. */
export function decryptMetaToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }

  const key = resolveMetaTokenKey();
  if (!key) {
    return token;
  }

  return safeDecrypt(token, key);
}
