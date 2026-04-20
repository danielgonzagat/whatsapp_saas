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

function isScalarValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function sanitizeArrayForAudit(value: unknown[], depth: number): unknown[] {
  return value.slice(0, 20).map((item) => sanitizeForAudit(item, depth + 1));
}

function sanitizeObjectForAudit(
  value: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const entries = Object.entries(value).slice(0, 40);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of entries) {
    out[key] = REDACTED_KEYS.has(key) ? '[REDACTED]' : sanitizeForAudit(raw, depth + 1);
  }
  return out;
}

export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return '[[depth]]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (isScalarValue(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return sanitizeArrayForAudit(value, depth);
  }
  if (typeof value === 'object') {
    return sanitizeObjectForAudit(value as Record<string, unknown>, depth);
  }
  return '[[unknown]]';
}
