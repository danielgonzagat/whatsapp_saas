import { redis } from './redis-client';

/**
 * =====================================================================
 * REDIS CONTEXT STORE PRO (SCALABLE)
 * =====================================================================
 *
 * Replaces in-memory EventEmitter with Redis Pub/Sub and Lists.
 * Allows multiple workers to coordinate flow execution.
 */

/**
 * =====================================================================
 * GENERIC CONTEXT STORE (KEY/VALUE + ZSET)
 * =====================================================================
 *
 * Usado pelo FlowEngineGlobal e AntiBan para:
 * - armazenar estado de execução
 * - gerenciar timeouts (ZSET)
 */
export class ContextStore {
  private prefix: string;

  constructor(prefix = 'flow-context') {
    this.prefix = prefix;
  }

  private k(key: string) {
    return `${this.prefix}:${key}`;
  }

  /** Get. */
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(this.k(key));
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  /** Set. */
  async set(key: string, value: unknown, ttlSeconds?: number) {
    const str = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(this.k(key), str, 'EX', ttlSeconds);
    } else {
      await redis.set(this.k(key), str);
    }
  }

  /** Delete. */
  async delete(key: string) {
    await redis.del(this.k(key));
  }

  /** Zadd. */
  async zadd(key: string, score: number, member: string) {
    await redis.zadd(this.k(key), score, member);
  }

  /** Zrange by score. */
  async zrangeByScore(key: string, min: number, max: number) {
    return redis.zrangebyscore(this.k(key), min, max);
  }

  /** Zrem. */
  async zrem(key: string, member: string) {
    await redis.zrem(this.k(key), member);
  }

  /** Zcount. */
  async zcount(key: string, min: number, max: number) {
    return redis.zcount(this.k(key), min, max);
  }

  /** Zrem range by score. */
  async zremRangeByScore(key: string, min: number, max: number) {
    await redis.zremrangebyscore(this.k(key), min, max);
  }

  /** Publish. */
  async publish(channel: string, message: unknown) {
    await redis.publish(channel, JSON.stringify(message));
  }
}
