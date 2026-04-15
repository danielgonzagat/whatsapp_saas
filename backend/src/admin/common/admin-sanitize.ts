/**
 * Redacts sensitive fields from request bodies before they land in the audit
 * log. Used by AdminAuditInterceptor.
 */

const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'oldPassword',
  'currentPassword',
  'passwordConfirmation',
  'code',
  'totp',
  'mfaCode',
  'token',
  'accessToken',
  'refreshToken',
  'changeToken',
  'setupToken',
  'mfaToken',
  'secret',
  'mfaSecret',
  'authorization',
  'cookie',
]);

export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[[depth]]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeForAudit(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
    const out: Record<string, unknown> = {};
    for (const [key, raw] of entries) {
      if (REDACTED_KEYS.has(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeForAudit(raw, depth + 1);
      }
    }
    return out;
  }
  return '[[unknown]]';
}
