import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor global para correlação de requisições.
 * Gera/propaga X-Request-Id e injeta em req.id para logs.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const incomingId =
      request.headers['x-request-id'] || request.headers['x-correlation-id'];
    const requestId = (incomingId as string) || uuid();

    request.id = requestId;
    if (!response.headersSent) {
      response.setHeader('x-request-id', requestId);
    }

    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          if (!response.headersSent) {
            response.setHeader(
              'x-response-time-ms',
              String(Date.now() - started),
            );
          }
        },
        error: () => {
          if (!response.headersSent) {
            response.setHeader(
              'x-response-time-ms',
              String(Date.now() - started),
            );
          }
        },
      }),
    );
  }
}
