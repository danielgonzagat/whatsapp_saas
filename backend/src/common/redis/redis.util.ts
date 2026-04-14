import { Logger } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';
import {
  RedisConfigurationError,
  resolveRedisUrl as canonicalResolveRedisUrl,
} from './resolve-redis-url';

const logger = new Logger('RedisUtil');

// Re-export the canonical helpers so existing imports of redis.util keep working.
export {
  RedisConfigurationError,
  isRedisConfigured,
  maskRedisUrl,
  resolveRedisUrl,
} from './resolve-redis-url';

/**
 * Backwards-compatible wrapper around the canonical resolver.
 *
 * Returns a string URL (not nullable) for callers that don't yet
 * handle the disabled-mode null case. When the canonical resolver
 * returns null (REDIS_MODE=disabled), this wrapper returns ''
 * (empty string), preserving the legacy "empty means disabled"
 * convention used by older code paths.
 *
 * New code should prefer importing `resolveRedisUrl` directly from
 * './resolve-redis-url' and handling the null case explicitly.
 */
export function getRedisUrl(): string {
  // The canonical resolver throws RedisConfigurationError when
  // REDIS_MODE=required and no URL can be discovered. Let it propagate.
  const url = canonicalResolveRedisUrl();

  if (!url) {
    return '';
  }

  if (
    process.env.NODE_ENV === 'production' &&
    (url.includes('localhost') || url.includes('127.0.0.1'))
  ) {
    logger.error('[REDIS] URL aponta para localhost em PRODUÇÃO! Configure REDIS_URL.');
  }

  return url;
}

/**
 * Cria um cliente Redis padrão com opções de retry.
 * Falha cedo quando Redis não está configurado em produção.
 *
 * **Test mode (PR P2-5):** when JEST_WORKER_ID is set, returns an
 * ioredis-mock instance instead of a real Redis client. ioredis-mock
 * implements the full ioredis API in-memory, including TTL semantics,
 * hash commands (hset/hget/hgetall), SET NX, SCAN, pipelines, and
 * pub/sub. Replaces the previous hand-rolled mock that silently
 * dropped TTLs and was missing hash commands entirely — a class of
 * test bugs where the production code path was never actually
 * exercised.
 */
export function createRedisClient(options?: RedisOptions): Redis | null {
  if (process.env.JEST_WORKER_ID) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IoRedisMock = require('ioredis-mock');
    return new IoRedisMock() as Redis;
  }

  const url = getRedisUrl();

  if (!url) {
    throw new RedisConfigurationError('Redis não configurado. Cliente Redis não pode ser criado.');
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
    ...options,
  });

  client.on('error', (err) => {
    logger.error('[REDIS] Erro de conexão: ' + err.message);
  });

  client.on('ready', () => {
    logger.log('[REDIS] Conexão pronta');
  });

  return client;
}
