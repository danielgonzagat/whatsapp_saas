import { createHash } from 'node:crypto';

const A_F0_9__64_RE = /^[a-f0-9]{64}$/i;

export function hashApiKey(key: string) {
  return createHash('sha256').update(String(key || '').trim()).digest('hex');
}

export function isHashedApiKey(key?: string | null) {
  return A_F0_9__64_RE.test(String(key || '').trim());
}

export function maskApiKeyForDisplay(key?: string | null) {
  const normalized = String(key || '').trim();
  if (!normalized) return null;
  if (isHashedApiKey(normalized)) return 'Stored securely';
  const suffix = normalized.slice(-4);
  return suffix ? `****${suffix}` : '****';
}
