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

     const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    // Generate/request requestId
    const requestId = req.headers['x-request-id'] || randomUUID().toString();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const { method, url, ip } = req;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        const statusCode = res.statusCode;
        // Log only slow requests (>1s), errors (4xx+), or when LOG_ALL_REQUESTS is set
        const logAll = process.env.LOG_ALL_REQUESTS === 'true';
        if (!isTestEnv && (logAll || statusCode >= 400 || duration > 1000)) {
          console.log(
            JSON.stringify({
              level: statusCode >= 400 ? 'warn' : 'info',
              msg: 'request_completed',
              method,
              url,
              statusCode,
              duration_ms: duration,
              ip,
              requestId,
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
            error: err?.message,
          };
          if (statusCode >= 500) {
            console.error(JSON.stringify(payload));
          } else {
            console.log(JSON.stringify(payload));
          }
        }
        throw err;
      }),
    );
  }
}
