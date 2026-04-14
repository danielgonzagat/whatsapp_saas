/**
 * Worker Bootstrap — entry point that resolves the Redis URL into
 * process.env BEFORE any module that imports ioredis loads.
 *
 * Previously this file:
 *   1. Duplicated the entire resolveRedisUrl logic locally to avoid
 *      circular imports.
 *   2. Monkey-patched ioredis by replacing require.cache exports so
 *      that any rogue `new Redis()` call without arguments would be
 *      forced to use the resolved URL instead of localhost.
 *
 * Both of those workarounds are removed in PR P2-3:
 *   1. The canonical resolver now lives at worker/resolve-redis-url.ts
 *      (byte-identical with backend/src/common/redis/resolve-redis-url.ts,
 *      enforced by scripts/ops/check-redis-resolver-sync.mjs).
 *   2. The monkeypatch is removed because every Redis client construction
 *      in the codebase now goes through resolveRedisUrl() before calling
 *      `new Redis(url, ...)`. No code can accidentally instantiate
 *      `new Redis()` against localhost in production.
 *
 * The remaining responsibility of this file is the order-of-operations
 * one: initialize Sentry, resolve the Redis URL, set process.env.REDIS_URL
 * so any module that reads it sees the correct value, and only THEN
 * dynamically import ./processor which starts the BullMQ worker.
 */

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV || 'development',
  enabled: process.env.NODE_ENV === 'production',
});

import { RedisConfigurationError, maskRedisUrl, resolveRedisUrl } from './resolve-redis-url';

console.log('========================================');
console.log('🚀 [WORKER BOOTSTRAP] Resolving Redis configuration...');
console.log('NODE_ENV:', process.env.NODE_ENV);

let resolvedUrl: string | null;
try {
  resolvedUrl = resolveRedisUrl();
} catch (err) {
  if (err instanceof RedisConfigurationError) {
    console.error('❌ [WORKER BOOTSTRAP] FATAL: Redis is required but unresolvable.');
    console.error('   ' + err.message);
    process.exit(1);
  }
  throw err;
}

if (resolvedUrl) {
  // Make the resolved URL visible to every downstream module that
  // reads process.env.REDIS_URL.
  process.env.REDIS_URL = resolvedUrl;
  console.log('✅ [WORKER BOOTSTRAP] Redis URL: ' + maskRedisUrl(resolvedUrl));

  if (resolvedUrl.includes('.railway.internal')) {
    console.warn(
      '⚠️  [WORKER BOOTSTRAP] URL uses .railway.internal — verify worker is on the same Railway network as Redis.',
    );
  }
} else {
  console.error('❌ [WORKER BOOTSTRAP] FATAL: REDIS_MODE=disabled but worker requires Redis.');
  console.error(
    '   The worker exists to process BullMQ jobs. Without Redis there is no queue to process.',
  );
  console.error('   Either configure REDIS_URL or do not deploy the worker.');
  process.exit(1);
}

console.log('========================================');
console.log('🚀 [WORKER BOOTSTRAP] Starting processor...');
console.log('========================================');

// Dynamic import: ensures process.env is fully populated before any
// downstream module evaluates its imports.
import('./processor');
