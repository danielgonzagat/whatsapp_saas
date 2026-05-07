import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

interface CacheOptions {
  /** TTL in seconds (default 60). */
  ttl?: number;
  /** Whether to skip caching when Redis is not ready (default true). */
  graceful?: boolean;
}

const DEFAULT_TTL = 60;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Reads a cached value by key. Returns null on miss or
   * when Redis is unreachable in graceful mode.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      this.logger.warn(
        `[cache] get failed for key=${key}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Writes a value to Redis with an optional TTL.
   * Returns true when the write succeeded, false otherwise.
   */
  async set(key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    try {
      const ttl = options?.ttl ?? DEFAULT_TTL;
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
      return true;
    } catch (err: unknown) {
      this.logger.warn(
        `[cache] set failed for key=${key}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return false;
    }
  }

  /**
   * Deletes one or more keys. Returns the count of deleted keys.
   */
  async del(...keys: string[]): Promise<number> {
    try {
      return await this.redis.del(...keys);
    } catch (err: unknown) {
      this.logger.warn(`[cache] del failed: ${err instanceof Error ? err.message : 'unknown'}`);
      return 0;
    }
  }

  /**
   * Wraps an async function with Redis caching.
   *
   * On a cache hit, returns the cached value without calling `fn`.
   * On a miss, calls `fn`, caches the result, and returns it.
   *
   * Exceptions thrown by `fn` are NOT cached and propagate to the caller.
   */
  async wrap<T>(key: string, fn: () => Promise<T>, options?: CacheOptions): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fn();
    await this.set(key, fresh, options);
    return fresh;
  }
}
