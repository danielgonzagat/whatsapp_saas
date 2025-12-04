import Redis, { RedisOptions } from 'ioredis';

const INTERNAL_HOST_PATTERNS = ['.railway.internal', 'redis.railway.internal'];

export function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('❌ [REDIS] Falta REDIS_URL no ambiente');
    throw new Error('REDIS_URL environment variable is required');
  }
  if (INTERNAL_HOST_PATTERNS.some((marker) => redisUrl.includes(marker))) {
    console.error('❌ [REDIS] Você está usando hostname interno. Use a URL pública da Railway.');
    throw new Error(
      'REDIS_URL cannot reference the internal Railway hostname. Use the public URL.',
    );
  }
  return redisUrl;
}

export function createRedisClient(options?: RedisOptions): Redis {
  const redisUrl = getRedisUrl();
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      // Exponential backoff capped at 2 seconds
      return Math.min(times * 50, 2000);
    },
    ...options,
  });
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
