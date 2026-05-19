import { InjectRedis } from '@nestjs-modules/ioredis';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

interface IdempotencyInterceptorRequest {
  _idempotencyKey?: unknown;
  _idempotencyTtl?: unknown;
}

interface IdempotencyInterceptorResponse {
  statusCode?: unknown;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readTtl(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 86400;
}

function readStatusCode(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 200;
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'unknown';
}

/**
 * Stores the handler's final response under the idempotency cache key after
 * the handler completes successfully, so that subsequent requests with the
 * same X-Idempotency-Key receive the exact same body.
 *
 * Invariant I1 (idempotency correctness) requires that:
 *   (a) the Redis write completes BEFORE the HTTP response is sent, so that
 *       concurrent requests see either the placeholder or the real body, never
 *       a race window with nothing cached.
 *   (b) the placeholder is cleaned up if the handler throws, so a crashed
 *       request does not leave a stale "processing" entry blocking subsequent
 *       requests for the full TTL (default 24h).
 *
 * Previously this used `tap(async (body) => { await redis.set(...) })`, which
 * does not await the returned Promise — the HTTP response was sent first and
 * the Redis write fired-and-forgot afterwards, breaking invariant (a). This
 * version uses `mergeMap` to fold the Redis write into the observable pipeline
 * and `catchError` to guarantee cleanup on handler errors.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /** Intercept. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<IdempotencyInterceptorRequest>();
    const cacheKey = readString(request._idempotencyKey);

    if (!cacheKey) {
      return next.handle();
    }

    const ttl = readTtl(request._idempotencyTtl);
    const response = context.switchToHttp().getResponse<IdempotencyInterceptorResponse>();
    const statusCode = readStatusCode(response.statusCode);

    return next.handle().pipe(
      mergeMap((body: unknown) =>
        from(this.cacheSuccessfulResponse(cacheKey, ttl, statusCode, body)),
      ),
      catchError((err: unknown) => {
        // Invariant I1: on handler error, clear the placeholder so a crashed
        // request does not block subsequent requests for the full TTL.
        this.redis.del(cacheKey).catch((delErr: unknown) => {
          this.logger.warn(
            `Idempotency placeholder cleanup failed: ${describeUnknownError(delErr)}`,
          );
        });
        return throwError(() => err);
      }),
    );
  }

  private async cacheSuccessfulResponse(
    cacheKey: string,
    ttl: number,
    statusCode: number,
    body: unknown,
  ): Promise<unknown> {
    try {
      await this.redis.set(cacheKey, JSON.stringify({ statusCode, body }), 'EX', ttl);
    } catch (err: unknown) {
      // Never fail the request because the cache write failed, but log loudly:
      // this means idempotency is degraded for the response.
      this.logger.warn(`Idempotency cache store failed: ${describeUnknownError(err)}`);
    }
    return body;
  }
}
