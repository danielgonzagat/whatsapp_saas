import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * HTTP metrics emitter.
 *
 * After PR P3-1: NEVER falls back to `request.url` for the route
 * label. The previous version used:
 *
 *   const route = request.route?.path || request.url || 'unknown';
 *
 * which exploded prometheus cardinality whenever `request.route`
 * was undefined (404s, middleware-handled routes, OPTIONS preflight)
 * because `request.url` contains the dynamic segments and query
 * string of the actual request — every unique URL became its own
 * metric label series, blowing up scrape size and storage cost.
 *
 * The new version uses ONLY `request.route?.path` (the parameterized
 * route template like `/contacts/:id`). When that's not available,
 * we emit the metric with a fixed `unmatched` label so all unmatched
 * requests share a single bucket. This is the standard prom pattern
 * for "route not found in router".
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  /** Intercept. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method || 'UNKNOWN';
    const route: string = request.route?.path || 'unmatched';
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const diff = Number(process.hrtime.bigint() - start) / 1e9;
          const status = context.switchToHttp().getResponse()?.statusCode || 200;
          this.metrics.observeHttp(method, route, status, diff);
        },
        error: () => {
          const diff = Number(process.hrtime.bigint() - start) / 1e9;
          const status = context.switchToHttp().getResponse()?.statusCode || 500;
          this.metrics.observeHttp(method, route, status, diff);
        },
      }),
    );
  }
}
