import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    // Generate/request requestId
    const requestId = req.headers['x-request-id'] || randomUUID().toString();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const { method, url, ip } = req;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        // Structured log
        console.log(
          JSON.stringify({
            level: 'info',
            msg: 'request_completed',
            method,
            url,
            statusCode: res.statusCode,
            duration_ms: duration,
            ip,
            requestId,
          }),
        );
      }),
      catchError((err) => {
        const duration = Date.now() - now;
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'request_failed',
            method,
            url,
            statusCode: res.statusCode,
            duration_ms: duration,
            ip,
            requestId,
            error: err?.message,
          }),
        );
        throw err;
      }),
    );
  }
}
