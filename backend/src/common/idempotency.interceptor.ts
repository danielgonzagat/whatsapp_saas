import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';

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
      tap(async (body) => {
        try {
          await this.redis.set(
            cacheKey,
            JSON.stringify({ statusCode: response.statusCode, body }),
            'EX',
            ttl,
          );
        } catch (err: any) {
          this.logger.warn(`Idempotency cache store failed: ${err?.message}`);
        }
      }),
    );
  }
}
