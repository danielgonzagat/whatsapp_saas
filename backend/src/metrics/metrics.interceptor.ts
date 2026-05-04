import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Metrics, gauge, histogram, increment } from '../observability/metrics';
import {
  addSentryBreadcrumb,
  getSentryContext,
  type KloelSentryContext,
  setSentryWorkspaceContext,
} from '../observability/sentry-context';
import { MetricsService } from './metrics.service';

const KLOEL_HTTP_INFLIGHT = 'http.requests_inflight';
let inflightRequests = 0;

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

    // Mirror per-request workspace/user context into Sentry. Pulls from
    // `request.user` shape populated by the auth guards (JwtAuthGuard /
    // WorkspaceGuard); skipped for anonymous endpoints.
    const authedUser = request?.user as { id?: string; workspaceId?: string } | undefined;
    if (authedUser?.workspaceId) {
      setSentryWorkspaceContext(authedUser.workspaceId, authedUser.id);
    }

    const ctxSnapshot: Readonly<KloelSentryContext> = getSentryContext();
    addSentryBreadcrumb(`${method} ${route}`, 'http.request', {
      method,
      route,
      runtime: ctxSnapshot.runtime,
      workspaceId: ctxSnapshot.workspaceId,
      userId: ctxSnapshot.userId,
    });

    inflightRequests += 1;
    gauge(KLOEL_HTTP_INFLIGHT, inflightRequests, { method });

    return next.handle().pipe(
      tap({
        next: () => {
          const diff = Number(process.hrtime.bigint() - start) / 1e9;
          const status = context.switchToHttp().getResponse()?.statusCode || 200;
          this.metrics.observeHttp(method, route, status, diff);
          recordRequestOutcome(method, route, status, diff);
        },
        error: () => {
          const diff = Number(process.hrtime.bigint() - start) / 1e9;
          const status = context.switchToHttp().getResponse()?.statusCode || 500;
          this.metrics.observeHttp(method, route, status, diff);
          recordRequestOutcome(method, route, status, diff);
        },
      }),
    );
  }
}

function recordRequestOutcome(
  method: string,
  route: string,
  status: number,
  durationSec: number,
): void {
  inflightRequests = Math.max(0, inflightRequests - 1);
  gauge(KLOEL_HTTP_INFLIGHT, inflightRequests, { method });

  const durationMs = durationSec * 1000;
  Metrics.api.request(route, status, durationMs);
  histogram('http.request.size_factor', durationMs / Math.max(1, route.length), {
    method,
    status: String(status),
  });
  increment('http.request.outcome', { method, route, status: String(status) });
}
