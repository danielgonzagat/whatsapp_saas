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
 * The resolver duplication is gone, but the ioredis guard remains
 * necessary because transitive queue dependencies can still construct
 * `new Redis()` internally. In production that constructor defaults to
 * localhost, which is never correct inside the Railway worker container.
 *
 * PR P2-3 removed the resolver duplication:
 *   1. The canonical resolver now lives at worker/resolve-redis-url.ts
 *      (byte-identical with backend/src/common/redis/resolve-redis-url.ts,
 *      enforced by scripts/ops/check-redis-resolver-sync.mjs).
 *
 * The remaining responsibility of this file is the order-of-operations
 * one: initialize Sentry, resolve the Redis URL, set process.env.REDIS_URL
 * so any module that reads it sees the correct value, guard ioredis'
 * empty constructor default, and only THEN dynamically import
 * ./processor which starts the BullMQ worker.
 */

import tracer from 'dd-trace';
import { createRequire } from 'node:module';

const ddEnabled = Boolean(process.env.DD_API_KEY || process.env.DATADOG_API_KEY);
if (ddEnabled) {
  const version = process.env.DD_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA;
  tracer.init({
    service: process.env.DD_SERVICE || 'kloel-worker',
    env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
    ...(version ? { version } : {}),
    logInjection: true,
    runtimeMetrics: true,
  });
}

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV || 'development',
  enabled: process.env.NODE_ENV === 'production',
});

process.on('unhandledRejection', (reason) => {
  console.error('[WORKER] unhandledRejection:', reason);
  Sentry.captureException(reason, {
    tags: { type: 'worker_alert', operation: 'unhandled_rejection' },
    level: 'fatal',
  });
});

import { RedisConfigurationError, maskRedisUrl, resolveRedisUrl } from './resolve-redis-url';

type RedisConstructor = typeof import('ioredis').default;
type RedisModuleExport = RedisConstructor &
  typeof import('ioredis') & {
    default: RedisConstructor;
    Redis: RedisConstructor;
    prototype: RedisConstructor['prototype'];
  };

function installIoredisDefaultUrlGuard(redisUrl: string): void {
  const runtimeRequire = createRequire(__filename);
  const ioredisPath = runtimeRequire.resolve('ioredis');
  const OriginalRedis = runtimeRequire(ioredisPath) as RedisModuleExport;

  const RedisWithDefaultUrl = function (this: unknown, ...args: unknown[]) {
    const constructorArgs = args.length === 0 || args[0] == null ? [redisUrl] : args;
    const newTarget = new.target ?? RedisWithDefaultUrl;
    return Reflect.construct(OriginalRedis, constructorArgs, newTarget);
  } as unknown as RedisModuleExport;

  Object.setPrototypeOf(RedisWithDefaultUrl, OriginalRedis);
  RedisWithDefaultUrl.prototype = OriginalRedis.prototype;
  Object.defineProperties(RedisWithDefaultUrl, {
    Redis: { value: RedisWithDefaultUrl, configurable: true },
    default: { value: RedisWithDefaultUrl, configurable: true },
  });

  const cacheEntry = runtimeRequire.cache[ioredisPath];
  if (cacheEntry) {
    cacheEntry.exports = RedisWithDefaultUrl;
  }
}

console.log('========================================');
console.log('🚀 [WORKER BOOTSTRAP] Resolving Redis configuration...');
console.log('NODE_ENV:', process.env.NODE_ENV);

let resolvedUrl: string | null;
try {
  resolvedUrl = resolveRedisUrl();
} catch (err) {
  if (err instanceof RedisConfigurationError) {
    console.error('❌ [WORKER BOOTSTRAP] FATAL: Redis is required but unresolvable.');
    console.error(`   ${err.message}`);
    process.exit(1);
  }
  throw err;
}

if (resolvedUrl) {
  // Make the resolved URL visible to every downstream module that
  // reads process.env.REDIS_URL.
  process.env.REDIS_URL = resolvedUrl;
  installIoredisDefaultUrlGuard(resolvedUrl);
  console.log(`✅ [WORKER BOOTSTRAP] Redis URL: ${maskRedisUrl(resolvedUrl)}`);

  if (resolvedUrl.includes('.railway.internal')) {
    console.log('[WORKER BOOTSTRAP] Redis is using Railway internal networking.');
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
import('./pulse-runtime').then(({ startPulseRuntimeReporter }) => {
  const stopPulseReporter = startPulseRuntimeReporter();
  process.once('SIGINT', stopPulseReporter);
  process.once('SIGTERM', stopPulseReporter);
});
