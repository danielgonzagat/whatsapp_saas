import Redis, { RedisOptions } from 'ioredis';

const INTERNAL_HOST_PATTERNS = ['.railway.internal', 'redis.railway.internal'];

export function getRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }
  if (INTERNAL_HOST_PATTERNS.some((marker) => redisUrl.includes(marker))) {
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
    ...options,
  });
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}
