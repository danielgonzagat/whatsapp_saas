import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

interface RequestIdRequest {
  headers?: Record<string, unknown>;
  id?: string;
}

interface RequestIdResponse {
  headersSent?: boolean;
  setHeader: (name: string, value: string) => void;
}

function readHeader(headers: unknown, key: string): string | undefined {
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
    return undefined;
  }
  const value = (headers as Record<string, unknown>)[key];
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find((entry): entry is string => typeof entry === 'string' && !!entry);
    return first?.trim() ? first : undefined;
  }
  return undefined;
}

/**
 * Interceptor global para correlação de requisições.
 * Gera/propaga X-Request-Id e injeta em req.id para logs.
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  /** Intercept. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestIdRequest>();
    const response = context.switchToHttp().getResponse<RequestIdResponse>();

    const incomingId =
      readHeader(request.headers, 'x-request-id') ??
      readHeader(request.headers, 'x-correlation-id');
    const requestId = incomingId || randomUUID();

    request.id = requestId;
    if (!response.headersSent) {
      response.setHeader('x-request-id', requestId);
    }

    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          if (!response.headersSent) {
            response.setHeader('x-response-time-ms', String(Date.now() - started));
          }
        },
        error: () => {
          if (!response.headersSent) {
            response.setHeader('x-response-time-ms', String(Date.now() - started));
          }
        },
      }),
    );
  }
}
