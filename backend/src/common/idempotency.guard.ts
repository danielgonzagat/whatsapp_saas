import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';

export const IDEMPOTENCY_KEY = 'idempotency';
export const IDEMPOTENCY_TTL_KEY = 'idempotency_ttl';

/**
 * Decorator: mark a controller method as requiring idempotency enforcement.
 * @param ttlSeconds - How long to cache the idempotency key (default: 86400 = 24h)
 */
export const Idempotent = (ttlSeconds = 86400) => {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    SetMetadata(IDEMPOTENCY_KEY, true)(target, key, descriptor);
    SetMetadata(IDEMPOTENCY_TTL_KEY, ttlSeconds)(target, key, descriptor);
    return descriptor;
  };
};

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isIdempotent = this.reflector.get<boolean>(
      IDEMPOTENCY_KEY,
      context.getHandler(),
    );

    if (!isIdempotent) return true;

    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['x-idempotency-key'];

    if (!idempotencyKey) return true;

    const ttl = this.reflector.get<number>(
      IDEMPOTENCY_TTL_KEY,
      context.getHandler(),
    ) || 86400;

    const cacheKey = `idempotency:${idempotencyKey}`;

    try {
      const existing = await this.redis.get(cacheKey);
      if (existing) {
        const response = context.switchToHttp().getResponse();
        const cached = JSON.parse(existing);
        response.status(cached.statusCode || 200).json(cached.body);
        return false;
      }

      // Store a placeholder to prevent concurrent duplicates
      await this.redis.set(cacheKey, JSON.stringify({ processing: true }), 'EX', ttl);

      // Attach key to request so response interceptor can cache the result
      request._idempotencyKey = cacheKey;
      request._idempotencyTtl = ttl;
    } catch (err: any) {
      // Redis failure should not block the request
      this.logger.warn(`Idempotency check failed: ${err?.message}`);
    }

    return true;
  }
}
