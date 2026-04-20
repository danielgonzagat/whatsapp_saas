const PATTERN_RE = /:[^:@]*@/;
/**
 * Canonical Redis URL resolver — single source of truth.
 *
 * This file MUST be byte-identical with worker/resolve-redis-url.ts.
 * A CI guard (scripts/ops/check-redis-resolver-sync.mjs) enforces this.
 *
 * Why two copies instead of an import? The worker is a sibling package
 * with its own node_modules and no shared workspace package, so it can
 * not import from the backend at runtime. Duplicating the file and
 * enforcing identity in CI is simpler than introducing a third package.
 *
 * ## REDIS_MODE
 *
 * Three explicit modes control how the resolver behaves when no URL
 * can be discovered from environment variables:
 *
 *   - REDIS_MODE=required (the production-like default when
 *     NODE_ENV=production OR when running on Railway)
 *     The resolver throws RedisConfigurationError. Callers must NOT
 *     catch and degrade silently — Redis is a load-bearing dependency
 *     for queues, rate limiting, idempotency, and cache.
 *
 *   - REDIS_MODE=disabled
 *     The resolver returns null. Callers MUST check and either operate
 *     in a documented degraded mode or refuse to start. There is no
 *     "fall through to localhost" behavior in this mode.
 *
 *   - REDIS_MODE unset outside production-like runtimes
 *     The resolver falls back to redis://localhost:6379 with a warning.
 *     This is the dev convenience path. It is not enabled in production
 *     because silently routing to localhost in prod was the original
 *     class of bugs that motivated the ioredis monkeypatch (now removed).
 *
 * ## Discovery order
 *
 *   1. REDIS_URL           (preferred — accepts .railway.internal hosts)
 *   2. REDIS_HOST + REDIS_PORT + REDIS_PASSWORD (component assembly)
 *   3. REDIS_FALLBACK_URL  (last-resort env override)
 *   4. mode-dependent fallback (above)
 */

export class RedisConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisConfigurationError';
  }
}

function isLocalhost(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

function isRailwayPublicProxy(url: string): boolean {
  return url.includes('mainline.proxy.rlwy.net') || url.includes('.proxy.rlwy.net');
}

function isRailwayRuntime(): boolean {
  return [
    process.env.RAILWAY_PROJECT_ID,
    process.env.RAILWAY_ENVIRONMENT_ID,
    process.env.RAILWAY_SERVICE_ID,
    process.env.RAILWAY_DEPLOYMENT_ID,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

function isProductionLikeRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || isRailwayRuntime();
}

function assertProductionSafeRedisUrl(url: string): string {
  if (isProductionLikeRuntime() && isRailwayPublicProxy(url)) {
    throw new RedisConfigurationError(
      'Redis URL points to Railway public proxy in production. ' +
        'Backend/worker must use the internal REDIS_URL from Railway ' +
        '(for example redis://default:***@redis.railway.internal:6379), not REDIS_PUBLIC_URL.',
    );
  }
  return url;
}

/** Mask redis url. */
export function maskRedisUrl(url: string | null | undefined): string {
  if (!url) {
    return '(não configurado)';
  }
  return url.replace(PATTERN_RE, ':***@');
}

function getMode(): 'required' | 'disabled' | 'auto' {
  const mode = String(process.env.REDIS_MODE || '')
    .trim()
    .toLowerCase();
  if (mode === 'required') {
    return 'required';
  }
  if (mode === 'disabled') {
    return 'disabled';
  }
  if (mode === 'auto') {
    return 'auto';
  }
  // Default: required in production-like runtimes, auto otherwise.
  return isProductionLikeRuntime() ? 'required' : 'auto';
}

interface RedisComponents {
  host: string | undefined;
  port: string;
  user: string;
  password: string | undefined;
}

function readRedisComponents(): RedisComponents {
  return {
    host: process.env.REDIS_HOST ?? process.env.REDISHOST ?? process.env.REDIS_HOSTNAME,
    port: process.env.REDIS_PORT ?? process.env.REDISPORT ?? '6379',
    user:
      process.env.REDIS_USERNAME ?? process.env.REDISUSER ?? process.env.REDIS_USER ?? 'default',
    password: process.env.REDIS_PASSWORD ?? process.env.REDISPASSWORD ?? process.env.REDIS_PASS,
  };
}

function resolveFromComponents(components: RedisComponents): string | null {
  const { host, port, user, password } = components;
  if (host && password) {
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
    return assertProductionSafeRedisUrl(`redis://${auth}${host}:${port}`);
  }
  if (host && !password && !isProductionLikeRuntime()) {
    return `redis://${host}:${port}`;
  }
  return null;
}

function resolveFromModeFallback(): string | null {
  const mode = getMode();
  if (mode === 'disabled') {
    return null;
  }
  if (mode === 'required') {
    throw new RedisConfigurationError(
      'Redis is required but no URL could be resolved. ' +
        'Set REDIS_URL, REDIS_FALLBACK_URL, or REDIS_HOST + REDIS_PASSWORD. ' +
        'To opt out of Redis entirely, set REDIS_MODE=disabled.',
    );
  }
  // mode === 'auto' (dev): localhost fallback
  return 'redis://localhost:6379';
}

/**
 * Resolve a Redis URL from the environment. Returns:
 *   - a string URL when one is found OR when in dev fallback mode
 *   - null when REDIS_MODE=disabled and no URL is configured
 *
 * Throws RedisConfigurationError when REDIS_MODE=required and no URL
 * can be resolved.
 */
export function resolveRedisUrl(): string | null {
  // 1. REDIS_URL — accepts any host including .railway.internal
  if (process.env.REDIS_URL) {
    return assertProductionSafeRedisUrl(process.env.REDIS_URL);
  }

  // 2. Component assembly: REDIS_HOST + REDIS_PORT + REDIS_PASSWORD
  const fromComponents = resolveFromComponents(readRedisComponents());
  if (fromComponents !== null) {
    return fromComponents;
  }

  // 3. REDIS_FALLBACK_URL
  if (process.env.REDIS_FALLBACK_URL) {
    return assertProductionSafeRedisUrl(process.env.REDIS_FALLBACK_URL);
  }

  // 4. Mode-dependent fallback
  return resolveFromModeFallback();
}

/**
 * Returns true when at least one Redis env var is set. Does NOT throw.
 * Useful for callers that want to log "Redis configured" without
 * triggering full URL resolution.
 */
export function isRedisConfigured(): boolean {
  if (process.env.REDIS_URL) {
    return true;
  }
  const host = process.env.REDIS_HOST ?? process.env.REDISHOST ?? process.env.REDIS_HOSTNAME;
  const password =
    process.env.REDIS_PASSWORD ?? process.env.REDISPASSWORD ?? process.env.REDIS_PASS;
  if (host && password) {
    return true;
  }
  if (process.env.REDIS_FALLBACK_URL) {
    return true;
  }
  return false;
}

/**
 * Diagnostic helper: returns the discovered URL (masked) and the
 * effective mode. Safe to log at startup.
 */
export function describeRedisResolution(): {
  url: string | null;
  masked: string;
  mode: 'required' | 'disabled' | 'auto';
  isLocalhost: boolean;
  configured: boolean;
} {
  const mode = getMode();
  const configured = isRedisConfigured();
  let url: string | null = null;
  try {
    url = resolveRedisUrl();
  } catch {
    url = null;
  }
  return {
    url,
    masked: maskRedisUrl(url),
    mode,
    isLocalhost: !!(url && isLocalhost(url)),
    configured,
  };
}
