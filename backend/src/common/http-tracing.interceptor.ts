import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuid } from 'uuid';

/**
 * Propagates X-Request-Id on all inbound/outbound HTTP calls.
 * Works alongside RequestIdInterceptor (which handles timing);
 * this interceptor ensures the header is always present on the
 * request object so that downstream HttpService / fetch calls
 * can forward it.
 */
@Injectable()
export class HttpTracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const requestId = req.headers['x-request-id'] || req.id || uuid();

    // Ensure the header is set on the request for outbound propagation
    req.headers['x-request-id'] = requestId;

    // Set response header (guard against already-sent responses)
    const res = context.switchToHttp().getResponse();
    if (res && typeof res.setHeader === 'function' && !res.headersSent) {
      res.setHeader('X-Request-Id', requestId);
    }

    return next.handle();
  }
}
