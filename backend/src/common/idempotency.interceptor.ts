import { InjectRedis } from '@nestjs-modules/ioredis';
import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, from, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';

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

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const cacheKey = request._idempotencyKey;

    if (!cacheKey) return next.handle();

    const ttl = request._idempotencyTtl || 86400;
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      mergeMap((body) =>
        from(
          this.redis
            .set(cacheKey, JSON.stringify({ statusCode: response.statusCode, body }), 'EX', ttl)
            .then(() => body)
            .catch((err: unknown) => {
              // Never fail the request because the cache write failed, but
              // log loudly — this is a degraded state.
              this.logger.warn(
                `Idempotency cache store failed: ${err instanceof Error ? err.message : 'unknown'}`,
              );
              return body;
            }),
        ),
      ),
      catchError((err) => {
        // Invariant I1: on handler error, clear the placeholder so a crashed
        // request does not block subsequent requests for the full TTL.
        this.redis.del(cacheKey).catch((delErr: unknown) => {
          this.logger.warn(
            `Idempotency placeholder cleanup failed: ${delErr instanceof Error ? delErr.message : 'unknown'}`,
          );
        });
        return throwError(() => err);
      }),
    );
  }
}
