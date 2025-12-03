import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method || 'UNKNOWN';
    const route = request.route?.path || request.url || 'unknown';
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const diff = Number(process.hrtime.bigint() - start) / 1e9;
          const status =
            context.switchToHttp().getResponse()?.statusCode || 200;
          this.metrics.observeHttp(method, route, status, diff);
        },
        error: () => {
          const diff = Number(process.hrtime.bigint() - start) / 1e9;
          const status =
            context.switchToHttp().getResponse()?.statusCode || 500;
          this.metrics.observeHttp(method, route, status, diff);
        },
      }),
    );
  }
}
