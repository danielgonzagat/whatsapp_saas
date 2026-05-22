import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

interface CachedResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  private cacheKey(idemKey: string, method: string, path: string): string {
    return `idem:${method}:${path}:${idemKey}`;
  }

  async get(key: string, method: string, path: string): Promise<CachedResponse | null> {
    try {
      const raw = await this.redis.get(this.cacheKey(key, method, path));
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as CachedResponse;
      if (parsed && typeof parsed.status === 'number' && parsed.body !== undefined) {
        return parsed;
      }
      return null;
    } catch (err: unknown) {
      this.logger.warn(
        `Idempotency cache read failed: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
      return null;
    }
  }

  async set(
    key: string,
    method: string,
    path: string,
    status: number,
    body: unknown,
    ttlSec: number,
  ): Promise<void> {
    try {
      const ck = this.cacheKey(key, method, path);
      const payload = JSON.stringify({ status, body });
      await this.redis.set(ck, payload, 'EX', ttlSec);
    } catch (err: unknown) {
      this.logger.warn(
        `Idempotency cache write failed: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
    }
  }
}
