/**
 * Strips sensitive fields from payloads before logging.
 * Recursive: walks nested objects and arrays so a `password` deep
 * inside a request body is also redacted.
 *
 * Used by both the request logger (P3-1) and the audit log middleware.
 * Kept in a single module so the field list stays in sync — adding a
 * key here automatically protects every logging path.
 */
const REDACTED_KEYS = new Set([
  // Auth & credentials
  'password',
  'newpassword',
  'currentpassword',
  'senha',
  'pwd',
  'credentials',
  'authorization',
  'cookie',
  'session',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'jwt',
  'secret',
  // Payment instruments
  'bankaccount',
  'cardnumber',
  'cardccv',
  'cardcvv',
  'cardexpirymonth',
  'cardexpiryyear',
  'cvv',
  'creditcard',
  'pixkey',
  // Provider keys
  'apikey',
  'api_key',
  'webhooksecret',
]);

const MASKED_KEYS = new Set(['documento', 'cnpj_cpf', 'cpf_cnpj', 'fiscal_id', 'tax_id']);

function maskFiscalValue(value: unknown): string {
  if (typeof value !== 'string' || value.length <= 4) {
    return '[REDACTED]';
  }
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

function sanitizeEntry(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  if (REDACTED_KEYS.has(lower)) {
    return '[REDACTED]';
  }
  if (MASKED_KEYS.has(lower)) {
    return maskFiscalValue(value);
  }
  if (typeof value === 'object' && value !== null) {
    return sanitizePayload(value);
  }
  return value;
}

export function sanitizePayload(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = sanitizeEntry(key, value);
  }
  return result;
}
