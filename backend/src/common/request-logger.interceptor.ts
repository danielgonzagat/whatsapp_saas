import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { sanitizePayload } from './sanitize-payload';

import { readString, readNumber } from './parse';
interface LoggedRequest {
  id?: unknown;
  method?: unknown;
  url?: unknown;
  ip?: unknown;
  body?: unknown;
}

interface LoggedResponse {
  statusCode?: unknown;
}

function getErrorStatus(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'getStatus' in error &&
    typeof (error as { getStatus?: unknown }).getStatus === 'function'
  ) {
    const status = (error as { getStatus: () => unknown }).getStatus();
    return readNumber(status) ?? 500;
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return readNumber((error as { status?: unknown }).status) ?? 500;
  }
  return 500;
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return readString((error as { message?: unknown }).message);
  }
  return undefined;
}

/**
 * Structured request logger.
 *
 * After PR P3-1:
 *   - Reads `req.id` set by RequestIdInterceptor (which now runs first
 *     in the APP_INTERCEPTOR pipeline). No more independent UUID
 *     generation that produced a different ID per interceptor.
 *   - Uses the canonical recursive `sanitizePayload` from
 *     ./sanitize-payload instead of the previous shallow top-level
 *     redactor that missed nested passwords.
 *   - The `body` payload in logs is whatever the recursive sanitizer
 *     produces; nested credentials, tokens, and card data are
 *     redacted regardless of nesting depth.
 */
@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggerInterceptor.name);

  /** Intercept. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<LoggedRequest>();
    const res = http.getResponse<LoggedResponse>();

    const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    // P3-1: read the canonical request id set by RequestIdInterceptor.
    // The interceptor pipeline guarantees req.id exists by the time
    // we run because RequestIdInterceptor is registered first in
    // app.module.ts. Fall back to an empty string only as a defensive
    // measure for non-HTTP contexts (we don't generate our own UUID
    // here — that was the bug that produced multiple IDs per request).
    const requestId = readString(req.id) ?? '';

    const method = readString(req.method);
    const url = readString(req.url);
    const ip = readString(req.ip);
    const { body } = req;
    const safeBody = body ? sanitizePayload(body) : undefined;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        if (!isTestEnv) {
          this.logger.log(
            JSON.stringify({
              msg: 'request_completed',
              method,
              url,
              statusCode: readNumber(res.statusCode),
              duration_ms: duration,
              ip,
              requestId,
              body: safeBody,
            }),
          );
        }
      }),
      catchError((err: unknown) => {
        const duration = Date.now() - now;
        const statusCode = getErrorStatus(err);

        if (!isTestEnv) {
          const payload = {
            level: statusCode >= 500 ? 'error' : 'warn',
            msg: 'request_failed',
            method,
            url,
            statusCode,
            duration_ms: duration,
            ip,
            requestId,
            body: safeBody,
            error: getErrorMessage(err),
          };
          if (statusCode >= 500) {
            this.logger.error(JSON.stringify(payload));
          } else {
            this.logger.log(JSON.stringify(payload));
          }
        }
        throw err;
      }),
    );
  }
}
