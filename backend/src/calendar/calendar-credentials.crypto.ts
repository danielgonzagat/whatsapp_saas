import { encryptString, safeDecrypt } from '../lib/crypto';
import type { ProviderCalendarSettings } from '../whatsapp/provider-settings.types';

function resolveCalendarCredentialsEncryptionKey() {
  return String(process.env.ENCRYPTION_KEY || process.env.PROVIDER_SECRET_KEY || '').trim();
}

export function decryptCalendarCredential(value?: string | null) {
  const token = String(value || '').trim();
  if (!token) return token;

  const key = resolveCalendarCredentialsEncryptionKey();
  if (!key) return token;

  return safeDecrypt(token, key);
}

export function encryptCalendarCredential(value?: string | null) {
  const token = decryptCalendarCredential(value);
  if (!token) return token;

  const key = resolveCalendarCredentialsEncryptionKey();
  if (!key) return token;

  return encryptString(token, key);
}

export function normalizeCalendarCredentialsForStorage(
  value?: ProviderCalendarSettings['credentials'] | null,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string') {
      normalized[key] = raw;
      continue;
    }

    if (key === 'clientSecret' || key === 'refreshToken' || key === 'accessToken') {
      normalized[key] = encryptCalendarCredential(raw);
    } else {
      normalized[key] = raw;
    }
  }

  return normalized;
}
