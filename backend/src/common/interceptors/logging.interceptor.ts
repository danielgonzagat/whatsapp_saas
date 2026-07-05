import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<{ method: string; path: string }>();
    const res = http.getResponse<{ statusCode: number; setHeader?: (name: string, value: string) => void }>();

    const { method, path } = req;

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        const { statusCode } = res;

        this.logger.log(`${method} ${path} ${statusCode} ${responseTime}ms`);

        res.setHeader?.('X-Response-Time', `${responseTime}ms`);
      }),
    );
  }
}
