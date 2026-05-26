import * as crypto from 'node:crypto';

/**
 * Canonical PII hash for ad-platform Conversions APIs (Google, Meta, TikTok).
 *
 * Returns the SHA-256 of the lowercased+trimmed input as lowercase hex.
 * Empty/whitespace-only inputs produce `''` so the caller can omit the field.
 *
 * Three call sites used this exact implementation byte-for-byte:
 *   - google-ads-enhanced-conversions.service.ts
 *   - meta-conversions-api.service.ts
 *   - tiktok-events-api.service.ts
 *
 * Keep this in one place: all three platforms expect SHA-256(lower(trim(x))).
 */
export function hashPii(value: string | undefined | null): string {
  if (!value) {
    return '';
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
