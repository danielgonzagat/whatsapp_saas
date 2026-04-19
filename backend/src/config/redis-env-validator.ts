/**
 * Production-time Redis env validation helpers.
 *
 * Extracted from app-config.module.ts so each helper is measured on its
 * own by complexity scanners (Codacy / lizard conflate neighbouring TS
 * functions in the same file into a single inflated-CCN entry).
 *
 * Ownership / contract is unchanged: the startup-time check ensures a
 * Redis URL is configured and not routed through Railway's public proxy
 * when NODE_ENV=production and REDIS_MODE is not explicitly disabled.
 */
export function resolveRedisMode(raw: unknown): string {
  if (typeof raw === 'string') return raw.toLowerCase();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw).toLowerCase();
  return '';
}

export function hasRedisUrlConfigured(value: Record<string, unknown>): boolean {
  return !!(value.REDIS_URL || value.REDIS_FALLBACK_URL);
}

export function hasRedisComponentAuth(value: Record<string, unknown>): boolean {
  return !!(value.REDIS_HOST || value.REDISHOST) && !!(value.REDIS_PASSWORD || value.REDISPASSWORD);
}

export function collectRedisUrlCandidates(value: Record<string, unknown>): string[] {
  const host =
    typeof value.REDIS_HOST === 'string'
      ? value.REDIS_HOST
      : typeof value.REDISHOST === 'string'
        ? value.REDISHOST
        : '';
  const urls = [
    typeof value.REDIS_URL === 'string' ? value.REDIS_URL : '',
    typeof value.REDIS_FALLBACK_URL === 'string' ? value.REDIS_FALLBACK_URL : '',
    host,
  ];
  return urls.filter(Boolean);
}

export function includesRailwayPublicProxy(candidate: string): boolean {
  return candidate.includes('mainline.proxy.rlwy.net') || candidate.includes('.proxy.rlwy.net');
}

export function assertRedisConfigured(value: Record<string, unknown>): void {
  if (hasRedisUrlConfigured(value) || hasRedisComponentAuth(value)) return;
  throw new Error(
    'Redis is required in production but no Redis URL could be resolved from env. ' +
      'Set REDIS_URL, REDIS_FALLBACK_URL, or REDIS_HOST + REDIS_PASSWORD. ' +
      'To opt out entirely, set REDIS_MODE=disabled.',
  );
}

export function assertNoPublicProxyHost(value: Record<string, unknown>): void {
  const candidates = collectRedisUrlCandidates(value);
  if (!candidates.some(includesRailwayPublicProxy)) return;
  throw new Error(
    'Redis must use Railway internal networking in production. ' +
      'Configure REDIS_URL from the Redis service (for example redis://default:***@redis.railway.internal:6379) ' +
      'and remove REDIS_PUBLIC_URL/public proxy hosts from backend/worker env.',
  );
}

export function redisInProductionValidator(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const isProd = value.NODE_ENV === 'production';
  if (!isProd) return value;

  const mode = resolveRedisMode(value.REDIS_MODE);
  if (mode === 'disabled') return value;

  assertRedisConfigured(value);
  assertNoPublicProxyHost(value);
  return value;
}
