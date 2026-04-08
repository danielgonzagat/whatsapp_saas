import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
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

// Number of times to poll a processing placeholder before giving up and
// treating the placeholder as stale.
const POLL_MAX_ATTEMPTS = 5;
// Delay between polls in milliseconds. 5 attempts × 200ms = 1s max wait.
const POLL_INTERVAL_MS = 200;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isIdempotent = this.reflector.get<boolean>(IDEMPOTENCY_KEY, context.getHandler());

    if (!isIdempotent) return true;

    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['x-idempotency-key'];

    if (!idempotencyKey) return true;

    const ttl = this.reflector.get<number>(IDEMPOTENCY_TTL_KEY, context.getHandler()) || 86400;

    const cacheKey = `idempotency:${idempotencyKey}`;

    try {
      // Invariant I1: look up the cache first. Possible states:
      //   (a) no entry       → store placeholder, let handler run
      //   (b) processing=true → another request is in flight, poll briefly
      //   (c) real response   → return the cached body (never undefined)
      const existing = await this.redis.get(cacheKey);

      if (existing) {
        const decision = await this.handleExistingEntry(cacheKey, existing, context);
        if (decision.kind === 'responded') return false;
        if (decision.kind === 'proceed') {
          // fall through to store a new placeholder and let the handler run
        }
      }

      // Store a processing placeholder so concurrent duplicates can detect us
      await this.redis.set(
        cacheKey,
        JSON.stringify({ processing: true, startedAt: Date.now() }),
        'EX',
        ttl,
      );

      // Attach key to request so the response interceptor can cache the result
      request._idempotencyKey = cacheKey;
      request._idempotencyTtl = ttl;
    } catch (err: any) {
      // Redis failure should not block the request — degrade to "no dedup"
      this.logger.warn(`Idempotency check failed: ${err?.message}`);
    }

    return true;
  }

  /**
   * Handle an existing Redis entry for the idempotency key. Either:
   *   - Sends a cached response and returns { kind: 'responded' }
   *   - Clears a stale placeholder and returns { kind: 'proceed' }
   */
  private async handleExistingEntry(
    cacheKey: string,
    existing: string,
    context: ExecutionContext,
  ): Promise<{ kind: 'responded' | 'proceed' }> {
    let cached: any;
    try {
      cached = JSON.parse(existing);
    } catch {
      // Corrupt cache entry — treat as if no entry exists.
      await this.redis.del(cacheKey).catch(() => undefined);
      return { kind: 'proceed' };
    }

    if (cached?.processing === true) {
      // Another request is in flight. Poll briefly for its completion.
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);
        const retry = await this.redis.get(cacheKey).catch(() => null);
        if (!retry) {
          // The in-flight request errored and cleared the placeholder.
          return { kind: 'proceed' };
        }
        let retryParsed: any;
        try {
          retryParsed = JSON.parse(retry);
        } catch {
          return { kind: 'proceed' };
        }
        if (retryParsed?.processing !== true && retryParsed?.body !== undefined) {
          const response = context.switchToHttp().getResponse();
          response.status(retryParsed.statusCode || 200).json(retryParsed.body);
          return { kind: 'responded' };
        }
      }
      // Poll exhausted. The placeholder is stale (crashed peer?). Clear it
      // and let this request proceed normally.
      this.logger.warn(
        `Idempotency placeholder ${cacheKey} still processing after ` +
          `${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms; clearing as stale`,
      );
      await this.redis.del(cacheKey).catch(() => undefined);
      return { kind: 'proceed' };
    }

    if (cached?.body !== undefined) {
      // Normal cached response. Return it verbatim.
      const response = context.switchToHttp().getResponse();
      response.status(cached.statusCode || 200).json(cached.body);
      return { kind: 'responded' };
    }

    // Entry exists but has no body and is not a processing placeholder.
    // This should not happen in practice — treat as corrupt and clear.
    this.logger.warn(`Idempotency entry ${cacheKey} has no body; clearing`);
    await this.redis.del(cacheKey).catch(() => undefined);
    return { kind: 'proceed' };
  }
}
