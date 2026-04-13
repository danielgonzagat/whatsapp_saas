import './instrument';

/**
 * Backend Bootstrap — entry point that resolves the Redis URL into
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
 *   1. The canonical resolver now lives at common/redis/resolve-redis-url.ts
 *      and has zero NestJS dependencies, so it can be imported here
 *      without circular concerns.
 *   2. The monkeypatch is removed because every Redis client construction
 *      in the codebase now goes through createRedisClient() or the
 *      RedisModule factory, both of which use the canonical resolver.
 *      No code can accidentally instantiate `new Redis()` against
 *      localhost in production.
 *
 * The remaining responsibility of this file is the order-of-operations
 * one: resolve the URL, set process.env.REDIS_URL so any module that
 * reads it sees the correct value, and only THEN dynamically import
 * ./main which kicks off the NestJS application.
 */

import {
  resolveRedisUrl,
  maskRedisUrl,
  RedisConfigurationError,
} from './common/redis/resolve-redis-url';

console.log('========================================');
console.log('🚀 [BOOTSTRAP] Resolving Redis configuration...');

let resolvedUrl: string | null;
try {
  resolvedUrl = resolveRedisUrl();
} catch (err) {
  if (err instanceof RedisConfigurationError) {
    console.error('❌ [BOOTSTRAP] FATAL: Redis is required but unresolvable.');
    console.error('   ' + err.message);
    process.exit(1);
  }
  throw err;
}

if (resolvedUrl) {
  // Make the resolved URL visible to every downstream module that
  // reads process.env.REDIS_URL.
  process.env.REDIS_URL = resolvedUrl;
  console.log('✅ [BOOTSTRAP] Redis URL: ' + maskRedisUrl(resolvedUrl));

  if (resolvedUrl.includes('.railway.internal')) {
    console.warn(
      '⚠️  [BOOTSTRAP] URL uses .railway.internal — verify backend is on the same Railway network as Redis.',
    );
  }
} else {
  console.warn(
    '⚠️  [BOOTSTRAP] Redis disabled (REDIS_MODE=disabled). Cache, queues, and rate limiting will refuse operations.',
  );
}

console.log('========================================');
console.log('🚀 [BOOTSTRAP] Loading NestJS application...');
console.log('========================================');

// Dynamic import: ensures process.env is fully populated before any
// downstream module evaluates its imports. The void operator marks
// the promise as intentionally fire-and-forget.
void import('./main');
