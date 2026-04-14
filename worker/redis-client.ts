/**
 * Worker Redis clients (general, subscriber, publisher).
 *
 * After PR P2-3:
 *   - The canonical resolveRedisUrl is shared with the backend
 *     (worker/resolve-redis-url.ts is byte-identical with
 *     backend/src/common/redis/resolve-redis-url.ts).
 *   - The dead createMockRedis fallback is removed. It was unreachable
 *     in production because worker/queue.ts called process.exit(1) on
 *     Redis resolution failure BEFORE this module ever loaded its
 *     fallback path. The result was confusion: the code looked
 *     defensive but was never exercised.
 *   - Worker bootstrap now fails fast on REDIS_MODE=disabled, so by
 *     the time this module loads, REDIS_URL is guaranteed to be set.
 */

import Redis from 'ioredis';
import { maskRedisUrl, resolveRedisUrl } from './resolve-redis-url';

const redisUrl = resolveRedisUrl();
if (!redisUrl) {
  // bootstrap.ts guarantees this never happens (it exits before
  // loading any module that imports redis-client). The check exists
  // as a defensive belt-and-braces in case redis-client is somehow
  // loaded outside the bootstrap path.
  throw new Error(
    'redis-client.ts loaded without a resolved Redis URL. ' +
      'This indicates the worker bootstrap order is broken. ' +
      'See worker/bootstrap.ts.',
  );
}

console.log('========================================');
console.log('✅ [WORKER/REDIS-CLIENT] Using Redis:', maskRedisUrl(redisUrl));
console.log('========================================');

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
};

// Cliente para comandos gerais
export const redis = new Redis(redisUrl, redisOptions);
redis.on('error', (err) => {
  console.error('❌ [WORKER/redis] Redis error:', err.message);
});
redis.on('ready', () => {
  console.log('✅ [WORKER/redis] Redis pronto');
});

// Cliente para Pub/Sub (Subscriber precisa de conexão exclusiva)
export const redisSub = new Redis(redisUrl, redisOptions);
redisSub.on('error', (err) => {
  console.error('❌ [WORKER/redisSub] Redis error:', err.message);
});

// Cliente para Pub/Sub (Publisher)
export const redisPub = new Redis(redisUrl, redisOptions);
redisPub.on('error', (err) => {
  console.error('❌ [WORKER/redisPub] Redis error:', err.message);
});

// Exporta flag para verificação em outros módulos. After P2-3 this is
// always true at runtime — bootstrap exits before this module loads
// when Redis is unavailable. Kept as an export for backward
// compatibility with callers that read it.
export const isRedisConfigured = true;
