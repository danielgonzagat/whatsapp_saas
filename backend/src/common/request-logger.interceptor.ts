import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { sanitizePayload } from './sanitize-payload';

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

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    // P3-1: read the canonical request id set by RequestIdInterceptor.
    // The interceptor pipeline guarantees req.id exists by the time
    // we run because RequestIdInterceptor is registered first in
    // app.module.ts. Fall back to an empty string only as a defensive
    // measure for non-HTTP contexts (we don't generate our own UUID
    // here — that was the bug that produced multiple IDs per request).
    const requestId: string = req.id || '';

    const { method, url, ip, body } = req;
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
              statusCode: res.statusCode,
              duration_ms: duration,
              ip,
              requestId,
              body: safeBody,
            }),
          );
        }
      }),
      catchError((err) => {
        const duration = Date.now() - now;
        const statusCode =
          typeof err?.getStatus === 'function'
            ? err.getStatus()
            : typeof err?.status === 'number'
              ? err.status
              : 500;

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
            error: err?.message,
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
