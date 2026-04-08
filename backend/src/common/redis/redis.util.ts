import Redis, { RedisOptions } from 'ioredis';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
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
 */
export function createRedisClient(options?: RedisOptions): Redis | null {
  // In Jest, return an in-memory mock so tests don't need a real Redis.
  // PR P2-5 will replace this with ioredis-mock for proper TTL/hash semantics.
  if (process.env.JEST_WORKER_ID) {
    const store = new Map<string, any>();
    const emitter = new EventEmitter();

    const client: any = {
      get: async (key: string) => store.get(key),
      set: async (key: string, value: any) => {
        store.set(key, value);
        return 'OK';
      },
      setex: async (key: string, _ttl: number, value: any) => {
        store.set(key, value);
        return 'OK';
      },
      incr: async (key: string) => {
        const v = (store.get(key) || 0) + 1;
        store.set(key, v);
        return v;
      },
      incrby: async (key: string, n: number) => {
        const v = (store.get(key) || 0) + n;
        store.set(key, v);
        return v;
      },
      expire: async () => 1,
      lrange: async () => [],
      rpush: async () => 0,
      publish: async () => 1,
      subscribe: async () => 1,
      psubscribe: async () => 1,
      on: (event: string, listener: (...args: any[]) => void) => {
        emitter.on(event, listener);
        return client;
      },
      emit: (event: string, ...args: any[]) => emitter.emit(event, ...args),
      duplicate: () => client,
      quit: async () => 'OK',
      disconnect: () => undefined,
    };

    return client as Redis;
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
