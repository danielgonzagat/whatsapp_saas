import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

/**
 * Fail-closed rate limiting enforcement.
 * Requires Redis for multi-instance consistency.
 * If Redis unavailable or RATE_LIMIT_DISABLED env is set, behavior is determined
 * accordingly (disabled or 503).
 *
 * Invariant: rate limit must enforce across all instances consistently.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = StructuredLogger.from(RateLimitService.name);

  constructor(@Optional() @InjectRedis() private readonly redis: Redis | null = null) {}

  private isExplicitE2ETestHarness(): boolean {
    return (
      process.env.NODE_ENV !== 'production' &&
      !process.env.JEST_WORKER_ID &&
      process.env.NODE_ENV !== 'test' &&
      (process.env.E2E_TEST_MODE === 'true' || process.env.OPENAI_API_KEY === 'e2e-dummy-key')
    );
  }

  async checkRateLimit(key: string, limit = 5, windowMs = 5 * 60 * 1000) {
    const throwTooMany = () => {
      throw new HttpException(
        'Muitas tentativas, aguarde alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    };

    // Fail-closed (invariant: auth rate limit must enforce across instances).
    //
    // The old implementation fell back to an in-memory Map when Redis was
    // unavailable. In a multi-instance deployment this is worse than useless:
    // each instance enforced its own 5/minute limit, so an attacker could
    // spread attempts across N instances and get 5×N attempts per window.
    //
    // The only way to keep rate limiting meaningful under multi-instance
    // deployment is to require Redis. If Redis is unavailable, reject the
    // request with 503. In development/test, set RATE_LIMIT_DISABLED=true to
    // bypass entirely.
    if (process.env.RATE_LIMIT_DISABLED === 'true' || this.isExplicitE2ETestHarness()) {
      return;
    }

    if (!this.redis) {
      this.logger.error(
        'Rate limiting unavailable: Redis not configured. Rejecting login attempt.',
      );
      throw new ServiceUnavailableException(
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
      );
    }

    try {
      const ttlSeconds = Math.ceil(windowMs / 1000);
      const total = await this.redis.incr(key);
      if (total === 1) {
        await this.redis.expire(key, ttlSeconds);
      }
      if (total > limit) {
        throwTooMany();
      }
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // Distinguish "rate limit exceeded" (rethrow) from Redis errors (fail closed).
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error(
        `Rate limiting Redis failure: ${errInstanceofError?.message || 'unknown'}. Rejecting login attempt.`,
      );
      throw new ServiceUnavailableException(
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
      );
    }
  }
}
