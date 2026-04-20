import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Propagates X-Request-Id on all inbound/outbound HTTP calls.
 *
 * After PR P3-1: this interceptor reads `req.id` set by the
 * RequestIdInterceptor (which now runs first in the APP_INTERCEPTOR
 * pipeline). It does NOT generate its own UUID anymore — that was
 * the bug that produced three different IDs per request when no
 * inbound `x-request-id` header was present.
 *
 * The job of this interceptor is to ensure the `x-request-id`
 * header on `req.headers` matches `req.id` so that downstream
 * HttpService / fetch calls forwarding `req.headers` get the
 * correct value (some legacy code paths read from headers instead
 * of req.id).
 */
@Injectable()
export class HttpTracingInterceptor implements NestInterceptor {
  /** Intercept. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const requestId: string = req.id || '';

    if (requestId) {
      req.headers['x-request-id'] = requestId;
    }

    // Set response header (guard against already-sent responses).
    // RequestIdInterceptor already does this; we set it again as
    // a belt-and-braces measure for code paths that bypass the
    // RequestId interceptor (e.g. SSE handlers using @Res()).
    const res = context.switchToHttp().getResponse();
    if (requestId && res && typeof res.setHeader === 'function' && !res.headersSent) {
      res.setHeader('X-Request-Id', requestId);
    }

    return next.handle();
  }
}
